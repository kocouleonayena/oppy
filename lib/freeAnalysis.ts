import { createHmac, randomUUID } from "node:crypto";
import { getClientIp } from "@/lib/rateLimit";

type Reservation =
  | { ok: true; commit: () => Promise<boolean>; release: () => Promise<void> }
  | { ok: false; status: number; error: string };

function configuration() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const pepper = process.env.OPPY_QUOTA_SECRET;
  if (!url || !token || !pepper || pepper.length < 24) return null;
  return { url, token, pepper };
}

async function evalRedis(url: string, token: string, lua: string, keys: string[], args: string[]): Promise<number> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", lua, keys.length, ...keys, ...args]),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Quota store unavailable");
  const payload = (await response.json()) as { result?: unknown; error?: unknown };
  if (payload.error || payload.result === null || payload.result === undefined) {
    throw new Error("Invalid Redis response");
  }
  const result = Number(payload.result);
  if (!Number.isFinite(result)) throw new Error("Invalid quota result");
  return result;
}

export async function reserveFreeAnalysis(request: Request): Promise<Reservation> {
  const config = configuration();
  if (!config) return { ok: false, status: 503, error: "Le quota du pilote n'est pas encore configuré." };

  const ip = getClientIp(request);
  if (!ip || ip === "unknown") return { ok: false, status: 503, error: "Connexion non identifiable pour le pilote." };

  const fingerprint = createHmac("sha256", config.pepper).update(ip).digest("hex");
  // v3 corrige l'ancien compteur qui pouvait garder une réservation échouée pendant 180 jours.
  const userKey = `oppy:free:v3:${fingerprint}`;
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const globalKey = `oppy:pilot:month:${month}`;
  const id = randomUUID();
  const max = Math.max(1, Math.min(100, Number(process.env.OPPY_MONTHLY_AI_LIMIT) || 10));
  const reserveScript = `
    local existing = redis.call('GET', KEYS[1])
    if existing then
      if string.sub(existing, 1, 5) == 'used:' then return 0 end
      return -2
    end
    local count = tonumber(redis.call('GET', KEYS[2]) or '0')
    if count >= tonumber(ARGV[1]) then return -1 end
    redis.call('SET', KEYS[1], 'hold:' .. ARGV[2], 'EX', 180)
    redis.call('INCR', KEYS[2])
    redis.call('EXPIRE', KEYS[2], 3024000)
    return 1
  `;
  try {
    const status = await evalRedis(config.url, config.token, reserveScript, [userKey, globalKey], [String(max), id]);
    if (status === 0) return { ok: false, status: 429, error: "Une analyse gratuite a déjà abouti depuis cette connexion. Le paiement des analyses supplémentaires sera proposé prochainement." };
    if (status === -2) return { ok: false, status: 409, error: "Une analyse est déjà en cours depuis cette connexion. Attends la fin de cet essai avant de recommencer." };
    if (status === -1) return { ok: false, status: 429, error: "Le quota mensuel d'essais privés est atteint." };
    if (status !== 1) throw new Error("Unexpected reservation status");
  } catch {
    return { ok: false, status: 503, error: "Le compteur des analyses gratuites est temporairement indisponible." };
  }

  const commitScript = `
    if redis.call('GET', KEYS[1]) ~= 'hold:' .. ARGV[1] then return 0 end
    redis.call('SET', KEYS[1], 'used:' .. ARGV[1], 'EX', 15552000)
    return 1
  `;
  const releaseScript = `
    if redis.call('GET', KEYS[1]) ~= 'hold:' .. ARGV[1] then return 0 end
    redis.call('DEL', KEYS[1])
    if tonumber(redis.call('GET', KEYS[2]) or '0') > 0 then redis.call('DECR', KEYS[2]) end
    return 1
  `;
  return {
    ok: true,
    commit: async () => {
      try {
        return (await evalRedis(config.url, config.token, commitScript, [userKey], [id])) === 1;
      } catch { return false; }
    },
    release: async () => {
      try { await evalRedis(config.url, config.token, releaseScript, [userKey, globalKey], [id]); }
      catch { /* L'attente expire automatiquement sous 180 secondes. */ }
    },
  };
}
