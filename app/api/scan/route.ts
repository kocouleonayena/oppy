import { callOpenAIFallback } from "@/lib/openaiFallback";
import { reserveFreeAnalysis } from "@/lib/freeAnalysis";
import { analysisUnavailable, pilotAnalysisEnabled } from "@/lib/pilotAccess";
import { NextResponse } from "next/server";
import {
  MODEL,
  MAX_TOKENS,
  TEMPERATURE,
  SCAN_SYSTEM_PROMPT,
  buildScanUserPrompt,
  type ScanResult,
} from "@/lib/scanPrompt";
import { parseLenientJson } from "@/lib/lenientJson";
import { enforceRateLimit } from "@/lib/rateLimit";
import { callGemini } from "@/lib/gemini";

// Runtime Node.js.
export const runtime = "nodejs";
// Pas de cache : chaque scan est unique.
export const dynamic = "force-dynamic";
// L'appel au modèle peut être long : on autorise jusqu'à 60 s (Vercel).
export const maxDuration = 60;

/**
 * Valide et normalise la sortie du modèle vers la forme ScanResult.
 * On ne fait pas confiance aveuglément au modèle : on borne le score,
 * on garantit des tableaux, et on filtre les problèmes mal formés.
 */
function normalize(data: unknown): ScanResult {
  const obj = (data ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0; };
  const strings = (v: unknown): string[] => Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean).slice(0, 15)
    : [];
  const dimRaw = (obj.dimensions ?? {}) as Record<string, unknown>;
  const keys = ["adequation", "competences", "experiences", "presentation", "valorisation"] as const;
  const dimensions = {} as ScanResult["dimensions"];
  for (const key of keys) {
    const d = (dimRaw[key] ?? {}) as Record<string, unknown>;
    dimensions[key] = { score: num(d.score), justification: typeof d.justification === "string" ? d.justification.slice(0, 600) : "Justification indisponible." };
  }
  const cx = (obj.contexte ?? {}) as Record<string, unknown>;
  const problems = Array.isArray(obj.problemes) ? obj.problemes : [];
  const severites = ["élevée","moyenne","faible"];
  return {
    score: num(obj.score),
    dimensions,
    contexte: {
      pays: typeof cx.pays === "string" ? cx.pays.slice(0, 120) : "Non déterminé",
      secteur: typeof cx.secteur === "string" ? cx.secteur.slice(0, 120) : "Non déterminé",
      typeRecruteur: typeof cx.typeRecruteur === "string" ? cx.typeRecruteur.slice(0, 120) : "Non déterminé",
      incertitudes: strings(cx.incertitudes).slice(0, 5),
    },
    pointsForts: strings(obj.pointsForts),
    problemes: problems.map((p: unknown) => {
      const v = (p ?? {}) as Record<string, unknown>;
      return { severite: severites.includes(String(v.severite)) ? String(v.severite) : "faible", texte: typeof v.texte === "string" ? v.texte.trim() : "" };
    }).filter((p: {texte:string}) => p.texte.length > 0).slice(0, 15) as ScanResult["problemes"],
    motsClesManquants: strings(obj.motsClesManquants),
    recommandations: strings(obj.recommandations),
    questions: strings(obj.questions).slice(0, 3),
    avertissement: typeof obj.avertissement === "string" ? obj.avertissement.slice(0,400) : "Évaluation indicative fondée sur les informations fournies.",
  };
}

export async function POST(request: Request) {
  if (!pilotAnalysisEnabled()) return analysisUnavailable();
  // 0. Limite de débit : protège la clé API contre les abus.
  const limited = enforceRateLimit(request, "scan", 10, 60_000);
  if (limited) return limited;

  // 1. Lecture et validation des entrées. L'annonce est optionnelle.
  let cv: string;
  let annonce: string | undefined;
  let aiProvidersConsent = false;
  try {
    const body = await request.json();
    cv = typeof body?.cv === "string" ? body.cv.trim() : "";
    annonce = typeof body?.annonce === "string" ? body.annonce.trim() : "";
    aiProvidersConsent = body?.aiProvidersConsent === true;
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  if (!cv || !annonce) {
    return NextResponse.json({ error: "Le CV et le texte de l’offre sont requis." }, { status: 400 });
  }

  if (cv.length > 30000 || (annonce?.length ?? 0) > 20000) return NextResponse.json({ error: "Document trop long." }, { status: 413 });

  if (!aiProvidersConsent) {
    return NextResponse.json(
      { error: "Accepte le traitement du CV et de l'offre par Gemini et, si nécessaire, OpenAI pour lancer l'analyse." },
      { status: 400 }
    );
  }

  // Réservation atomique avant l'appel coûteux au modèle.
  // En phase pilote, seul le diagnostic gratuit est autorisé.
  const reservation = await reserveFreeAnalysis(request);
  if (!reservation.ok) return NextResponse.json({error: reservation.error}, {status: reservation.status, headers: {"Cache-Control": "no-store"}});

  // Gemini reste prioritaire ; OpenAI n'est appelé qu'avec l'accord de l'utilisateur.
  const system = SCAN_SYSTEM_PROMPT;
  const user = buildScanUserPrompt(cv, annonce);
  const primary = await callGemini({
    model: MODEL, system, user,
    maxOutputTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });

  let reportText = "";
  let provider: "gemini" | "openai" = "gemini";

  if (primary.ok) {
    reportText = primary.text;
  } else {
    const fallbackAllowed = ["unavailable", "error", "empty", "no-key"].includes(primary.reason);
    if (fallbackAllowed) {
      const backup = await callOpenAIFallback({ system, user });
      if (backup.ok) {
        reportText = backup.text;
        provider = "openai";
      } else {
        await reservation.release();
        // Les documents et les réponses brutes ne sont jamais journalisés.
        console.error("OPPY AI unavailable", {
          primary: primary.reason,
          fallback: backup.reason,
        });
        const message = backup.reason === "not-configured"
          ? "Gemini est indisponible et le secours OpenAI n'est pas encore configuré."
          : "Les services d'IA sont momentanément indisponibles. Ton analyse gratuite n'a pas été décomptée.";
        return NextResponse.json({ error: message }, {
          status: 503,
          headers: { "Cache-Control": "no-store", "Retry-After": "60" },
        });
      }
    } else {
      await reservation.release();
      return NextResponse.json(
        { error: "L'analyse n'a pas abouti. Ton essai gratuit n'a pas été décompté." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  // 3. Parse + validation du JSON structuré.
  let result: ScanResult;
  try {
    result = normalize(parseLenientJson(reportText));
  } catch {
    await reservation.release();
    console.error("Scan : format JSON invalide reçu du modèle.");
    return NextResponse.json(
      { error: "Le diagnostic n'a pas pu être lu (format inattendu). Réessaie." },
      { status: 502 }
    );
  }

  // Une analyse n'est marquée utilisée qu'après un rapport valide.
  // Une réservation non finalisée expire après 180 s, ce qui évite de bloquer
  // le candidat pendant des mois après un incident ou un arrêt de fonction.
  const committed = await reservation.commit();
  if (!committed) {
    console.error("OPPY quota commit failed after successful analysis");
    // L'analyse est déjà produite : ne pas masquer le résultat au candidat.
  }
  return NextResponse.json({ result, provider }, { headers: { "Cache-Control": "no-store" } });
}
