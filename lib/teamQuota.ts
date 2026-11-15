import { randomUUID } from "node:crypto";
import { testerIdentity, internalTestingEnabled } from "@/lib/teamAccess";

function redis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? {url,token} : null;
}
function teamLimit() {
  return Math.max(1,Math.min(100,Number(process.env.OPPY_TEAM_MONTHLY_LIMIT || "20") || 20));
}
function monthKey() {
  const date=new Date();
  return `oppy:team:month:${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}`;
}
async function redisEval(r:{url:string;token:string},script:string,keys:string[],args:string[]):Promise<number> {
  const response=await fetch(r.url,{
    method:"POST",
    headers:{"Authorization":"Bearer "+r.token,"Content-Type":"application/json"},
    body:JSON.stringify(["EVAL",script,keys.length,...keys,...args]),
    cache:"no-store",signal:AbortSignal.timeout(5000),
  });
  if(!response.ok) throw Error("Redis failure");
  const data=(await response.json()) as {result?:unknown;error?:unknown};
  if(data.error || data.result===undefined || data.result===null) throw Error("Unexpected Redis payload");
  const value=Number(data.result);
  if(!Number.isFinite(value)) throw Error("Invalid counter");
  return value;
}

export async function getTeamUsage(request:Request) {
  if(!internalTestingEnabled() || !testerIdentity(request)) return null;
  const r=redis();if(!r) return null;
  try {
    const response=await fetch(r.url,{
      method:"POST",headers:{"Authorization":"Bearer "+r.token,"Content-Type":"application/json"},
      body:JSON.stringify(["GET",monthKey()]),cache:"no-store",signal:AbortSignal.timeout(4000),
    });
    if(!response.ok) return null;
    const data=(await response.json()) as {result?:unknown;error?:unknown};
    if(data.error) return null;
    const used=Number(data.result || 0);
    return {used:Number.isFinite(used)?used:0,limit:teamLimit()};
  } catch {return null;}
}

export async function reserveTeamAnalysis(request:Request):Promise<
  | {ok:true;commit:()=>Promise<boolean>;release:()=>Promise<void>}
  | {ok:false;status:number;error:string}
> {
  if(!internalTestingEnabled()) return {ok:false,status:403,error:"Mode de test désactivé."};
  const tester=testerIdentity(request);
  if(!tester) return {ok:false,status:401,error:"Connecte-toi à l'espace équipe avant de lancer un essai."};
  const r=redis();
  if(!r) return {ok:false,status:503,error:"Le compteur de test est indisponible."};
  const lock="oppy:team:lock:"+tester;
  const monthly=monthKey();
  const reservation=randomUUID();
  const script=`
    if redis.call('EXISTS',KEYS[1])==1 then return -2 end
    local n=tonumber(redis.call('GET',KEYS[2]) or '0')
    if n>=tonumber(ARGV[1]) then return -1 end
    redis.call('SET',KEYS[1],ARGV[2],'EX',180)
    redis.call('INCR',KEYS[2])
    redis.call('EXPIRE',KEYS[2],3024000)
    return 1
  `;
  try {
    const n=await redisEval(r,script,[lock,monthly],[String(teamLimit()),reservation]);
    if(n===-1)return {ok:false,status:429,error:"Quota mensuel des tests internes atteint."};
    if(n===-2)return {ok:false,status:409,error:"Un test est déjà en cours dans cette session."};
    if(n!==1)throw Error("Reservation not accepted");
  }catch {return {ok:false,status:503,error:"La vérification du quota interne est indisponible."};}

  const unlock=async():Promise<boolean>=>{
    try{
      const n=await redisEval(r,
        "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('DEL',KEYS[1]);return 1 end;return 0",
        [lock],[reservation]);
      return n===1;
    }catch{return false;}
  };
  // Quota de tests compte les TENTATIVES coûteuses, même si les API échouent :
  // plafond de dépense distinct de la première analyse gratuite publique.
  return {ok:true,commit:unlock,release:async()=>{await unlock();}};
}
