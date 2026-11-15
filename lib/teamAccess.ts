import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getClientIp } from "@/lib/rateLimit";

const COOKIE = "oppy_team_session";

export function internalTestingEnabled(): boolean {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.OPPY_INTERNAL_TESTS_ENABLED === "true" &&
    !!process.env.OPPY_QUOTA_SECRET &&
    (process.env.OPPY_TEST_ACCESS_CODE?.length ?? 0) >= 24;
}
function secret(): string { return process.env.OPPY_QUOTA_SECRET || ""; }
function hmac(input: string): string { return createHmac("sha256", secret()).update(input).digest("hex"); }

export function isTester(request: Request): boolean {
  if (!internalTestingEnabled()) return false;
  const cookie = request.headers.get("cookie") || "";
  const token = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiry, nonce, signature] = parts;
  if (!/^\d{10,13}$/.test(expiry) || !/^[0-9a-f-]{36}$/.test(nonce)) return false;
  if (Number(expiry) < Date.now()) return false;
  const expected = hmac("oppy-team-v1:" + expiry + ":" + nonce);
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
}

export function testerIdentity(request: Request): string | null {
  if (!isTester(request)) return null;
  const token = (request.headers.get("cookie") || "").split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  const nonce = token?.split(".")[1];
  return nonce && /^[0-9a-f-]{36}$/.test(nonce) ? hmac("tester:" + nonce) : null;
}

export function validAccessCode(proposed: unknown): boolean {
  if (!internalTestingEnabled() || typeof proposed !== "string" || proposed.length > 512) return false;
  const reference = process.env.OPPY_TEST_ACCESS_CODE || "";
  // Toujours comparer des empreintes de longueur fixe.
  return timingSafeEqual(
    createHmac("sha256", secret()).update(proposed).digest(),
    createHmac("sha256", secret()).update(reference).digest(),
  );
}

export function newTesterCookie(): string {
  const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
  const nonce = randomUUID();
  const signature = hmac("oppy-team-v1:" + expiry + ":" + nonce);
  return COOKIE + "=" + expiry + "." + nonce + "." + signature +
    "; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict";
}

export function expiredTesterCookie(): string {
  return COOKIE + "=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict";
}

export function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; }
  catch { return false; }
}

export async function limitLoginAttempts(request: NextRequest): Promise<boolean> {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  const ip = getClientIp(request);
  if (!ip || ip === "unknown") return false;
  const key = "oppy:team:auth:" + hmac(ip);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL",
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n",
        1,key]),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return false;
    const payload = (await response.json()) as {result?:unknown;error?:unknown};
    return !payload.error && Number(payload.result) <= 5;
  } catch { return false; }
}
