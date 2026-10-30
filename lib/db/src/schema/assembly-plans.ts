import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export interface LockedAssemblyConnection {
  fromPart: string;
  toPart: string;
}

export interface AssemblyPartRecord {
  id: string;
  name: string;
  shape: "box" | "cylinder";
  dimensions: { x: number; y: number; z: number };
  color: string;
}

export interface AssemblyCandidateRecord {
  title: string;
  summary: string;
  parts: AssemblyPartRecord[];
  connections: {
    fromPart: string;
    toPart: string;
    kind: "rigid" | "hinge" | "slide";
  }[];
  steps: string[];
  designNotes: string[];
}

export interface AssemblyValidationRecord {
  valid: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
  warnings: string[];
}

export const assemblyPlansTable = pgTable("assembly_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull(),
  prompt: text("prompt").notNull(),
  useCase: varchar("use_case", { length: 24 }).notNull(),
  status: varchar("status", { length: 24 }).notNull(),
  requiredParts: jsonb("required_parts").$type<string[]>().notNull(),
  requiredConnections: jsonb("required_connections")
    .$type<LockedAssemblyConnection[]>()
    .notNull(),
  maxParts: integer("max_parts").notNull(),
  geometryBudget: integer("geometry_budget").notNull(),
  candidate: jsonb("candidate").$type<AssemblyCandidateRecord | null>(),
  validation: jsonb("validation").$type<AssemblyValidationRecord>().notNull(),
  repairAttempts: integer("repair_attempts").notNull().default(0),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

export type AssemblyPlanRecord = typeof assemblyPlansTable.$inferSelect;
