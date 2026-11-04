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
  // Un temps plafond total empêche Gemini d'occuper les 60 s disponibles
  // sur Vercel avant que le secours OpenAI puisse prendre le relais.
  const deadline = Date.now() + 17000;

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) return { ok: false, reason: "unavailable" };

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = ai.models.generateContent({
        model: opts.model,
        contents: opts.user,
        config: {
          systemInstruction: opts.system,
          responseMimeType: "application/json",
          maxOutputTokens: opts.maxOutputTokens,
          temperature: opts.temperature,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          httpOptions: { timeout: Math.max(1000, remaining - 500) },
        },
      });
      // Second garde-fou si le SDK ignore la limite réseau : libère le
      // traitement côté OPPY et permet le secours avant la fin de fonction.
      const response = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Gemini gateway deadline exceeded")),
            Math.max(1000, remaining)
          );
        }),
      ]);
      const finish = response.candidates?.[0]?.finishReason;
      const text = (response.text ?? "").trim();
      if (finish === "MAX_TOKENS") return { ok: false, reason: "truncated" };
      if (!text) return { ok: false, reason: "empty" };
      return { ok: true, text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const temporary = /(?:503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|timeout|deadline|abort)/i.test(message);
      if (temporary && attempt === 0 && deadline - Date.now() > 4000) {
        await new Promise(resolve => setTimeout(resolve, 700));
        continue;
      }
      return { ok: false, reason: temporary ? "unavailable" : "error" };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
  return { ok: false, reason: "unavailable" };
}
