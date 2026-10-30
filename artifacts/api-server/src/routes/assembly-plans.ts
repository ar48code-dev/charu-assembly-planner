import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  AcceptAssemblyPlanParams,
  AcceptAssemblyPlanResponse,
  CreateAssemblyPlanBody,
  CreateAssemblyPlanResponse,
  GetAssemblyPlanParams,
  GetAssemblyPlanResponse,
  GetAssemblyPlannerStatusResponse,
  GetAssemblyPlannerSummaryResponse,
  ListAssemblyPlansResponse,
} from "@workspace/api-zod";
import { assemblyPlansTable, db, type AssemblyPlanRecord } from "@workspace/db";
import {
  generateAssemblyPlan,
  NEBIUS_MODEL,
} from "../lib/assembly-planner";
import { NebiusError, NEBIUS_PROVIDER } from "../lib/nebius";

const router: IRouter = Router();

function getOwnerId(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
): string {
  const existing = req.signedCookies?.charu_session;
  if (typeof existing === "string" && /^[0-9a-f-]{36}$/i.test(existing)) {
    return existing;
  }
  const ownerId = randomUUID();
  res.cookie("charu_session", ownerId, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 180 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  return ownerId;
}

function toApiPlan(row: AssemblyPlanRecord) {
  return {
    id: row.id,
    prompt: row.prompt,
    useCase: row.useCase,
    status: row.status,
    requiredParts: row.requiredParts,
    requiredConnections: row.requiredConnections,
    maxParts: row.maxParts,
    geometryBudget: row.geometryBudget,
    candidate: row.candidate,
    validation: row.validation,
    repairAttempts: row.repairAttempts,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
  };
}

router.get("/assembly-planner/status", (_req, res): void => {
  const data = GetAssemblyPlannerStatusResponse.parse({
    configured: Boolean(process.env.NEBIUS_API_KEY),
    provider: NEBIUS_PROVIDER,
    model: NEBIUS_MODEL,
  });
  res.json(data);
});

router.get("/assembly-planner/summary", async (req, res): Promise<void> => {
  const ownerId = getOwnerId(req, res);
  const [totalResult, validResult, acceptedResult, recent] = await Promise.all([
    db
      .select({ value: count() })
      .from(assemblyPlansTable)
      .where(eq(assemblyPlansTable.ownerId, ownerId)),
    db
      .select({ value: count() })
      .from(assemblyPlansTable)
      .where(
        and(
          eq(assemblyPlansTable.ownerId, ownerId),
          inArray(assemblyPlansTable.status, ["valid", "accepted"]),
        ),
      ),
    db
      .select({ value: count() })
      .from(assemblyPlansTable)
      .where(
        and(
          eq(assemblyPlansTable.ownerId, ownerId),
          eq(assemblyPlansTable.status, "accepted"),
        ),
      ),
    db
      .select()
      .from(assemblyPlansTable)
      .where(eq(assemblyPlansTable.ownerId, ownerId))
      .orderBy(desc(assemblyPlansTable.createdAt))
      .limit(5),
  ]);
  res.json(
    GetAssemblyPlannerSummaryResponse.parse({
      totalPlans: totalResult[0]?.value ?? 0,
      validPlans: validResult[0]?.value ?? 0,
      acceptedPlans: acceptedResult[0]?.value ?? 0,
      recentPlans: recent.map(toApiPlan),
    }),
  );
});

router.get("/assembly-plans", async (req, res): Promise<void> => {
  const ownerId = getOwnerId(req, res);
  const rows = await db
    .select()
    .from(assemblyPlansTable)
    .where(eq(assemblyPlansTable.ownerId, ownerId))
    .orderBy(desc(assemblyPlansTable.createdAt))
    .limit(30);
  res.json(ListAssemblyPlansResponse.parse(rows.map(toApiPlan)));
});

router.post("/assembly-plans", async (req, res): Promise<void> => {
  const parsed = CreateAssemblyPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const normalizedParts = input.requiredParts.map((part) =>
    part.trim().toLowerCase(),
  );
  if (
    normalizedParts.some((part) => !part) ||
    new Set(normalizedParts).size !== normalizedParts.length
  ) {
    res.status(400).json({ error: "Required part names must be unique and non-empty." });
    return;
  }
  const normalizedLinks = input.requiredConnections.map(
    (connection) =>
      `${connection.fromPart.trim().toLowerCase()}->${connection.toPart.trim().toLowerCase()}`,
  );
  if (
    normalizedLinks.some((link) => link.startsWith("->") || link.endsWith("->")) ||
    new Set(normalizedLinks).size !== normalizedLinks.length ||
    input.requiredConnections.some(
      (connection) =>
        connection.fromPart.trim().toLowerCase() ===
        connection.toPart.trim().toLowerCase(),
    )
  ) {
    res.status(400).json({ error: "Locked connections must be unique, directed links between different named parts." });
    return;
  }
  if (!process.env.NEBIUS_API_KEY) {
    res.status(503).json({ error: "Nebius Token Factory is not configured. Add NEBIUS_API_KEY in Replit Secrets to enable genuine model plans." });
    return;
  }

  try {
    const result = await generateAssemblyPlan({
      prompt: input.prompt,
      useCase: input.useCase,
      requiredParts: input.requiredParts,
      requiredConnections: input.requiredConnections,
      maxParts: input.maxParts,
      geometryBudget: input.geometryBudget,
    });
    const ownerId = getOwnerId(req, res);
    const [row] = await db
      .insert(assemblyPlansTable)
      .values({
        ownerId,
        prompt: input.prompt,
        useCase: input.useCase,
        status: result.validation.valid ? "valid" : "invalid",
        requiredParts: input.requiredParts,
        requiredConnections: input.requiredConnections,
        maxParts: input.maxParts,
        geometryBudget: input.geometryBudget,
        candidate: result.candidate,
        validation: result.validation,
        repairAttempts: result.repairAttempts,
        model: NEBIUS_MODEL,
      })
      .returning();
    if (!row) {
      res.status(500).json({ error: "The plan could not be saved." });
      return;
    }
    res.status(201).json(CreateAssemblyPlanResponse.parse(toApiPlan(row)));
  } catch (error) {
    if (error instanceof NebiusError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Assembly plan generation failed");
    res.status(500).json({ error: "Assembly planning failed. No result was saved." });
  }
});

router.get("/assembly-plans/:id", async (req, res): Promise<void> => {
  const params = GetAssemblyPlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ownerId = getOwnerId(req, res);
  const [row] = await db
    .select()
    .from(assemblyPlansTable)
    .where(
      and(
        eq(assemblyPlansTable.id, params.data.id),
        eq(assemblyPlansTable.ownerId, ownerId),
      ),
    )
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Assembly plan not found." });
    return;
  }
  res.json(GetAssemblyPlanResponse.parse(toApiPlan(row)));
});

router.post("/assembly-plans/:id/accept", async (req, res): Promise<void> => {
  const params = AcceptAssemblyPlanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const ownerId = getOwnerId(req, res);
  const where = and(
    eq(assemblyPlansTable.id, params.data.id),
    eq(assemblyPlansTable.ownerId, ownerId),
  );
  const [existing] = await db
    .select()
    .from(assemblyPlansTable)
    .where(where)
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Assembly plan not found." });
    return;
  }
  if (existing.status === "accepted") {
    res.json(AcceptAssemblyPlanResponse.parse(toApiPlan(existing)));
    return;
  }
  if (existing.status !== "valid" || !existing.validation.valid) {
    res.status(409).json({ error: "Only a plan that passes every validation check can be accepted." });
    return;
  }
  const [accepted] = await db
    .update(assemblyPlansTable)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(and(where, eq(assemblyPlansTable.status, "valid")))
    .returning();
  if (!accepted) {
    const [latest] = await db
      .select()
      .from(assemblyPlansTable)
      .where(where)
      .limit(1);
    if (latest?.status === "accepted") {
      res.json(AcceptAssemblyPlanResponse.parse(toApiPlan(latest)));
      return;
    }
    res.status(409).json({ error: "The plan changed before it could be accepted. Reload and review it again." });
    return;
  }
  res.json(AcceptAssemblyPlanResponse.parse(toApiPlan(accepted)));
});

export default router;
