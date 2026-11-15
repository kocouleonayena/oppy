/**
 * Secours OpenAI pour le rapport d'analyse OPPY.
 * La requête reste côté serveur et l'API OpenAI ne conserve pas cet objet
 * Response dans l'historique applicatif (store:false).
 * Le compte OpenAI peut toutefois avoir ses propres règles de conservation
 * et de traitement des données : informer explicitement l'utilisateur.
 */

type OpenAIResult =
  | { ok: true; text: string }
  | { ok: false; reason: "not-configured" | "unavailable" | "unauthorized" | "invalid" | "credits" | "rate-limited" | "timeout"; status?: number; code?: string };

const dimension = {
  type: "object",
  additionalProperties: false,
  required: ["score", "justification"],
  properties: {
    score: { type: "integer" },
    justification: { type: "string" },
  },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "score", "dimensions", "contexte", "pointsForts", "problemes",
    "motsClesManquants", "recommandations", "questions", "avertissement",
  ],
  properties: {
    score: { type: "integer" },
    dimensions: {
      type: "object",
      additionalProperties: false,
      required: ["adequation", "competences", "experiences", "presentation", "valorisation"],
      properties: {
        adequation: dimension,
        competences: dimension,
        experiences: dimension,
        presentation: dimension,
        valorisation: dimension,
      },
    },
    contexte: {
      type: "object",
      additionalProperties: false,
      required: ["pays", "secteur", "typeRecruteur", "incertitudes"],
      properties: {
        pays: { type: "string" },
        secteur: { type: "string" },
        typeRecruteur: { type: "string" },
        incertitudes: { type: "array", items: { type: "string" } },
      },
    },
    pointsForts: { type: "array", items: { type: "string" } },
    problemes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severite", "texte"],
        properties: {
          severite: { type: "string", enum: ["élevée", "moyenne", "faible"] },
          texte: { type: "string" },
        },
      },
    },
    motsClesManquants: { type: "array", items: { type: "string" } },
    recommandations: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    avertissement: { type: "string" },
  },
} as const;

/** Modèle économique explicitement compatible avec l'API Responses. */
const MODEL = "gpt-6-luna";

export async function callOpenAIFallback(args: {
  system: string;
  user: string;
}): Promise<OpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, reason: "not-configured" };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: args.system,
        input: args.user,
        store: false,
        reasoning: { effort: "none" },
        max_output_tokens: 4000,
        text: { format: { type: "json_schema", name: "oppy_scan", strict: true, schema: SCHEMA } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) {
      // Ne traiter que le statut HTTP et le code technique, jamais le texte
      // complet du fournisseur (susceptible de contenir du contenu utilisateur).
      const body = (await response.json().catch(() => null)) as
        | { error?: { code?: unknown; type?: unknown } }
        | null;
      const rawCode = typeof body?.error?.code === "string" ? body.error.code : "";
      const permittedCodes = [
        "credit_balance_exhausted", "insufficient_quota",
        "organization_spend_limit_exceeded", "project_spend_limit_exceeded",
        "organization_usage_limit_exceeded", "rate_limit_exceeded",
        "slow_down", "server_is_overloaded", "model_not_found",
        "invalid_api_key", "invalid_request_error",
      ];
      const code = permittedCodes.includes(rawCode) ? rawCode : undefined;
      const credits = [
        "credit_balance_exhausted", "insufficient_quota",
        "organization_spend_limit_exceeded", "project_spend_limit_exceeded",
        "organization_usage_limit_exceeded",
      ].includes(rawCode);
      const reason = response.status === 401 || response.status === 403
        ? "unauthorized"
        : credits ? "credits"
        : response.status === 429 ? "rate-limited"
        : response.status >= 500 ? "unavailable"
        : "invalid";
      return { ok: false, reason, status: response.status, code };
    }

    const payload = (await response.json()) as {
      status?: string;
      output?: Array<{type?: string; content?: Array<{type?: string; text?: string}>}>;
    };
    if (payload.status && payload.status !== "completed") {
      return { ok: false, reason: "invalid" };
    }
    const text = (payload.output ?? [])
      .filter(item => item.type === "message")
      .flatMap(item => item.content ?? [])
      .filter(item => item.type === "output_text" && typeof item.text === "string")
      .map(item => item.text ?? "")
      .join("\n")
      .trim();
    if (!text) return { ok: false, reason: "invalid" };

    // Validation structurelle finale également effectuée dans /api/scan.
    return { ok: true, text };
  } catch (err) {
    const timeout = err instanceof Error && /abort|timeout/i.test(err.message);
    return { ok: false, reason: timeout ? "timeout" : "unavailable" };
  }
}
