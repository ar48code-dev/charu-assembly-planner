export const NEBIUS_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";
export const NEBIUS_PROVIDER = "Nebius Token Factory";
const API_URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";

export class NebiusError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface NebiusResult {
  value: unknown;
  latencyMs: number;
}

export async function callNebius(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<NebiusResult> {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) {
    throw new NebiusError(
      "Nebius Token Factory is not configured. Add NEBIUS_API_KEY in Replit Secrets to enable genuine model plans.",
      503,
    );
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NEBIUS_MODEL,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_completion_tokens: 4500,
        store: false,
        stream: false,
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    throw new NebiusError(
      "Nebius Token Factory could not be reached within 55 seconds. Nothing was saved.",
      502,
    );
  }

  if (!response.ok) {
    if ([401, 403].includes(response.status)) {
      throw new NebiusError(
        "Nebius rejected the configured key or model access. Check Token Factory account access; nothing was saved.",
        502,
      );
    }
    if (response.status === 429) {
      throw new NebiusError(
        "Nebius rate or credit limit reached. Nothing was saved.",
        503,
      );
    }
    throw new NebiusError(
      `Nebius inference failed with HTTP ${response.status}. Nothing was saved.`,
      502,
    );
  }

  let payload: unknown;
  try {
    const content = await response.text();
    if (content.length > 300_000) throw new Error("Provider response too large");
    payload = JSON.parse(content);
  } catch {
    throw new NebiusError(
      "Nebius returned a malformed or oversized response. Nothing was saved.",
      502,
    );
  }

  const data = payload as {
    choices?: Array<{
      message?: { content?: unknown };
      finish_reason?: string;
    }>;
  };
  const choice = data.choices?.[0];
  const text = choice?.message?.content;
  if (
    typeof text !== "string" ||
    text.length > 240_000 ||
    choice?.finish_reason === "length"
  ) {
    throw new NebiusError(
      "Nebius returned an empty or truncated plan. Nothing was saved.",
      502,
    );
  }

  try {
    return { value: JSON.parse(text), latencyMs: Date.now() - started };
  } catch {
    throw new NebiusError(
      "Nebius did not return valid JSON. Nothing was saved.",
      502,
    );
  }
}
