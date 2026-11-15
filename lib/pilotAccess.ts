import { NextResponse } from "next/server";

/**
 * Les prestations payantes ne doivent pas être exécutées avant
 * authentification, validation FedaPay côté serveur et contrôle des droits.
 * Cette réponse est volontairement indépendante de tout champ client.
 */
export function paidFeatureUnavailable() {
  return NextResponse.json(
    { error: "Cette fonctionnalité sera activée après la mise en place du paiement sécurisé." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

export function analysisUnavailable() {
  return NextResponse.json(
    { error: "Les analyses sont temporairement désactivées pendant la configuration du pilote." },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}

/** Aucune clé d'API ou paramètre transmis par le navigateur ne donne accès au service. */
export function pilotAnalysisEnabled() {
  return process.env.OPPY_PILOT_AI_ENABLED === "true";
}
