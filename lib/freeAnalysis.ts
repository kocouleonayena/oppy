import { createHmac } from "node:crypto";
import { getClientIp } from "@/lib/rateLimit";

/**
 * Réservation atomique d'une première analyse gratuite.
 * Compteur partagé nécessaire en environnement serverless.
 * Sans configuration Redis et secret serveur, refus systématique.
 */
export async function reserveFreeAnalysis(request: Request): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string }
> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const pepper = process.env.OPPY_QUOTA_SECRET;
  if (!url || !token || !pepper || pepper.length < 24) {
    return { ok: false, status: 503, error: "Le quota de la version pilote n'est pas encore configuré." };
  }

  const ip = getClientIp(request);
  if (!ip || ip === "unknown") {
    return { ok: false, status: 503, error: "Identification technique impossible pour la première analyse gratuite." };
  }
  // Aucun CV, nom ni contenu d'annonce n'est conservé dans le compteur.
  const fingerprint = createHmac("sha256", pepper).update(ip).digest("hex");
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const userKey = `oppy:free:${fingerprint}`;
  const globalKey = `oppy:pilot:month:${month}`;
  const max = Math.max(1, Math.min(1000, Number(process.env.OPPY_MONTHLY_AI_LIMIT || "30") || 30));

  // Redis exécute ce script atomiquement ; ni double clic ni accès concurrents
  // ne peuvent dépasser le nombre de réservations admises.
  const lua = `
    if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
    local used = tonumber(redis.call('GET', KEYS[2]) or '0')
    if used >= tonumber(ARGV[1]) then return -1 end
    redis.call('SET', KEYS[1], 'used', 'EX', 15552000)
    redis.call('INCR', KEYS[2])
    redis.call('EXPIRE', KEYS[2], 3024000)
    return 1
  `;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", lua, 2, userKey, globalKey, String(max)]),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Quota store failed");
    const data: unknown = await response.json();
    const result = Number((data as {result?: unknown}).result);
    if (result === 1) return { ok: true };
    if (result === 0) return { ok: false, status: 429, error: "Une analyse gratuite a déjà été utilisée depuis cette connexion. Les analyses supplémentaires seront disponibles après activation des paiements." };
    if (result === -1) return { ok: false, status: 429, error: "Le quota de tests gratuits du mois est atteint." };
    throw new Error("Unexpected quota response");
  } catch {
    // Fail closed : ne jamais facturer l'IA si le compteur est inaccessible.
    return { ok: false, status: 503, error: "La vérification des analyses gratuites est temporairement indisponible." };
  }
}
