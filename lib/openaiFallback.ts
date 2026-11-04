/**
 * Secours OpenAI pour le rapport d'analyse OPPY.
 * La requête reste côté serveur et l'API OpenAI ne conserve pas cet objet
 * Response dans l'historique applicatif (store:false).
 * Le compte OpenAI peut toutefois avoir ses propres règles de conservation
 * et de traitement des données : informer explicitement l'utilisateur.
 */
import type { ScanResult } from "@/lib/scanPrompt";

type OpenAIResult =
  | { ok: true; text: string }
  | { ok: false; reason: "not-configured" | "unavailable" | "unauthorized" | "invalid" };

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
        reasoning: { effort: "low" },
        max_output_tokens: 5000,
        text: { format: { type: "json_schema", name: "oppy_scan", strict: true, schema: SCHEMA } },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(28000),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        return { ok: false, reason: "unauthorized" };
      return { ok: false, reason: response.status >= 500 || response.status === 429 ? "unavailable" : "invalid" };
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
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
