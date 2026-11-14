import { NextRequest, NextResponse } from "next/server";
import { getTeamUsage } from "@/lib/teamQuota";
import {
  internalTestingEnabled, isTester, validAccessCode, newTesterCookie,
  expiredTesterCookie, originAllowed, limitLoginAttempts
} from "@/lib/teamAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authenticated=isTester(request);
  const usage=authenticated?await getTeamUsage(request):null;
  return NextResponse.json({
    enabled: internalTestingEnabled(),
    authenticated,
    usage,
  }, {headers: {"Cache-Control": "no-store"}});
}
export async function POST(request: NextRequest) {
  if (!internalTestingEnabled()) return NextResponse.json({error:"Accès interne désactivé."},{status:404});
  if (!originAllowed(request)) return NextResponse.json({error:"Origine non autorisée."},{status:403});
  if (!(await limitLoginAttempts(request))) return NextResponse.json({
    error:"Trop de tentatives ou contrôle de sécurité indisponible. Réessaie ultérieurement."
  },{status:429});
  let code:unknown;
  try { code = (await request.json()).code; } catch {}
  if (!validAccessCode(code)) return NextResponse.json({error:"Code d'accès invalide."},{status:401});
  const response = NextResponse.json({authenticated:true},{headers:{"Cache-Control":"no-store"}});
  response.headers.append("Set-Cookie",newTesterCookie());
  return response;
}
export async function DELETE(request: NextRequest) {
  if (!originAllowed(request)) return NextResponse.json({error:"Origine non autorisée."},{status:403});
  const response = NextResponse.json({authenticated:false},{headers:{"Cache-Control":"no-store"}});
  response.headers.append("Set-Cookie",expiredTesterCookie());
  return response;
}
