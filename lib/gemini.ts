/**
 * ============================================================================
 *  APPEL AU MODÈLE GEMINI (Google AI Studio)
 * ============================================================================
 *
 * Wrapper minimal autour du SDK @google/genai, partagé par les routes
 * /api/optimize et /api/scan. Aucune donnée n'est stockée : on appelle, on
 * renvoie le texte, et tout disparaît.
 *
 * La clé vient de la variable d'environnement GEMINI_API_KEY (jamais en dur).
 * Obtenir une clé gratuite : https://aistudio.google.com/apikey
 * ----------------------------------------------------------------------------
 */

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no-key" | "empty" | "truncated" | "unavailable" | "error"; detail?: string };

export async function callGemini(opts: {
  model: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature: number;
}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: "no-key" };

  const ai = new GoogleGenAI({ apiKey });
  // Un seul nouvel essai pour 503/429 : limite les coûts et la latence.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: opts.model,
        contents: opts.user,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          maxOutputTokens: opts.maxOutputTokens,
          temperature: opts.temperature,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const finish = response.candidates?.[0]?.finishReason;
      const text = (response.text ?? "").trim();
      if (finish === "MAX_TOKENS") return { ok: false, reason: "truncated" };
      if (!text) return { ok: false, reason: "empty" };
      return { ok: true, text };
    } catch (err) {
      // Ne jamais journaliser des messages du fournisseur contenant
      // potentiellement des informations personnelles du document.
      const message = err instanceof Error ? err.message : String(err);
      const temporary = /(?:\\b503\\b|\\b429\\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded)/i.test(message);
      if (temporary && attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        continue;
      }
      return { ok: false, reason: temporary ? "unavailable" : "error" };
    }
  }
  return { ok: false, reason: "unavailable" };
}
