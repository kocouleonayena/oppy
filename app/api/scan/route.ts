import { validateReport } from "@/lib/scanValidation";
import { reserveTeamAnalysis } from "@/lib/teamQuota";
import { originAllowed, isTester } from "@/lib/teamAccess";
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
  // Calcul déterministe du score global : même pondération pour Gemini et OpenAI.
  // Les notes partielles restent des estimations pédagogiques proposées par l'IA.
  const weightedScore = Math.round(
    dimensions.adequation.score * 0.40 +
    dimensions.competences.score * 0.20 +
    dimensions.experiences.score * 0.15 +
    dimensions.presentation.score * 0.10 +
    dimensions.valorisation.score * 0.15
  );
  const cx = (obj.contexte ?? {}) as Record<string, unknown>;
  const problems = Array.isArray(obj.problemes) ? obj.problemes : [];
  const severites = ["élevée","moyenne","faible"];
  return {
    score: weightedScore,
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
  let internalTest = false;
  try {
    const body = await request.json();
    cv = typeof body?.cv === "string" ? body.cv.trim() : "";
    annonce = typeof body?.annonce === "string" ? body.annonce.trim() : "";
    aiProvidersConsent = body?.aiProvidersConsent === true;
    internalTest = body?.internalTest === true;
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

  // Le mode équipe exige une session signée côté serveur et une requête
  // provenant de l'origine OPPY. Un champ JSON ne suffit jamais pour contourner le quota.
  if (internalTest && (!originAllowed(request) || !isTester(request))) {
    return NextResponse.json({error:"Accès aux tests internes non autorisé."},{status:403});
  }
  // Quotas indépendants dans Redis : gratuit public vs essais d'équipe.
  const reservation = internalTest
    ? await reserveTeamAnalysis(request)
    : await reserveFreeAnalysis(request);
  if (!reservation.ok) return NextResponse.json({error: reservation.error}, {status: reservation.status, headers: {"Cache-Control": "no-store"}});

  // Le même contrat valide les deux fournisseurs. Une réponse HTTP 200 ne
  // garantit pas un JSON complet, et une sortie invalide déclenche le secours.
  const system = SCAN_SYSTEM_PROMPT;
  const user = buildScanUserPrompt(cv, annonce);
  let parsedReport: unknown = null;
  let provider: "gemini" | "openai" = "gemini";
  let geminiFailure = "none";
  let backupFailure = "none";

  const primary = await callGemini({
    model: MODEL, system, user,
    maxOutputTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });
  if (primary.ok) {
    try {
      parsedReport = validateReport(primary.text);
    } catch {
      geminiFailure = "invalid-report";
    }
  } else {
    geminiFailure = primary.reason;
  }

  if (parsedReport === null) {
    const backup = await callOpenAIFallback({system, user});
    if (backup.ok) {
      try {
        parsedReport = validateReport(backup.text);
        provider = "openai";
      } catch {
        backupFailure = "invalid-report";
      }
    } else {
      backupFailure = backup.reason;
      // Ne journaliser ni CV, ni offre, ni réponse du modèle, ni clé secrète.
      console.error("OPPY AI fallback failed", {
        gemini: geminiFailure,
        openai: backup.reason,
        openaiHttpStatus: backup.status ?? null,
        openaiErrorCode: backup.code ?? null,
      });
    }
  }

  if (parsedReport === null) {
    await reservation.release();
    console.error("OPPY no valid report", {gemini:geminiFailure,openai:backupFailure});
    const messages: Record<string,string> = {
      "not-configured": "Le fournisseur OpenAI de secours n'est pas configuré.",
      "unauthorized": "L'accès API OpenAI a été refusé. Vérifie les autorisations de la clé.",
      "credits": "Le compte API OpenAI ne dispose pas des crédits nécessaires.",
      "rate-limited": "OpenAI limite momentanément les appels au service.",
      "timeout": "Les fournisseurs IA ont dépassé leur délai de réponse.",
      "invalid": "La configuration OpenAI a été rejetée.",
      "invalid-report": "Les fournisseurs IA n'ont pas renvoyé de rapport complet et exploitable.",
      "unavailable": "Les fournisseurs IA sont temporairement indisponibles.",
    };
    return NextResponse.json({
      error: (messages[backupFailure] || "L'analyse n'a pas abouti.") +
        (internalTest ? " Cette tentative est comptabilisée dans le quota de tests interne." :
          " Ton analyse gratuite n'a pas été décomptée."),
    },{status:502,headers:{"Cache-Control":"no-store"}});
  }

  const result:ScanResult = normalize(parsedReport);

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
