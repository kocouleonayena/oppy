import { NextResponse } from "next/server";
import { isTester, originAllowed } from "@/lib/teamAccess";
import { TEST_CASES } from "@/lib/testCases";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRITERIA = ["fidelity","relevance","actionability","clarity","context"] as const;
export async function POST(request:Request) {
  if(!isTester(request) || !originAllowed(request))
    return NextResponse.json({error:"Accès réservé à l'équipe."},{status:403});
  const url=process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token=process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url || !token) return NextResponse.json({error:"Stockage indisponible."},{status:503});
  let body:Record<string,unknown>;
  try { body=(await request.json()) as Record<string,unknown>; }
  catch {return NextResponse.json({error:"Données invalides."},{status:400});}
  const caseId=typeof body.caseId==="string"?body.caseId:"";
  if(!TEST_CASES.some(x=>x.id===caseId))
    return NextResponse.json({error:"Cas de test non reconnu."},{status:400});
  const ratings=(body.ratings??{}) as Record<string,unknown>;
  if(CRITERIA.some(k=> !Number.isInteger(ratings[k]) || Number(ratings[k])<1 || Number(ratings[k])>5))
    return NextResponse.json({error:"Note chaque critère de 1 à 5."},{status:400});
  const note=typeof body.note==="string"?body.note.trim():"";
  if(note.length>800) return NextResponse.json({error:"Observation trop longue."},{status:400});
  const entry={
    caseId,
    date:new Date().toISOString(),
    provider:body.provider==="openai"?"openai":"gemini",
    ratings:Object.fromEntries(CRITERIA.map(k=>[k,Number(ratings[k])])),
    note,
  };
  // Ne stocker ni CV, ni texte d'offre, ni rapport généré, ni identifiant personnel.
  const key="oppy:team:feedback";
  const script="redis.call('LPUSH',KEYS[1],ARGV[1]);redis.call('LTRIM',KEYS[1],0,199);redis.call('EXPIRE',KEYS[1],2592000);return 1";
  try {
    const res=await fetch(url,{
      method:"POST",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify(["EVAL",script,1,key,JSON.stringify(entry)]),
      cache:"no-store",signal:AbortSignal.timeout(5000),
    });
    if(!res.ok) throw Error("Storage failed");
    const json=(await res.json()) as {error?:unknown;result?:unknown};
    if(json.error || Number(json.result)!==1) throw Error("Storage rejected");
    return NextResponse.json({saved:true},{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"Enregistrement temporairement impossible."},{status:503});}
}
