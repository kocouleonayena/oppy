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

type RatingName = typeof CRITERIA[number];
type StoredReview = {caseId:string;date:string;provider:"gemini"|"openai";ratings:Record<RatingName,number>;note:string};

export async function GET(request:Request) {
  if (!isTester(request)) return NextResponse.json({error:"Accès réservé à l'équipe."},{status:403});
  const url=process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token=process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return NextResponse.json({error:"Stockage indisponible."},{status:503});
  try {
    const res=await fetch(url,{
      method:"POST",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify(["LRANGE","oppy:team:feedback",0,199]),
      cache:"no-store",
      signal:AbortSignal.timeout(5000),
    });
    if(!res.ok) throw Error("Redis read failed");
    const payload=(await res.json()) as {result?:unknown;error?:unknown};
    if(payload.error || !Array.isArray(payload.result))throw Error("Invalid Redis payload");

    // Ne jamais renvoyer les documents analysés ou d'autres champs de Redis.
    const known=new Set(TEST_CASES.map(x=>x.id));
    const reviews:StoredReview[]=[];
    for(const value of payload.result) {
      if(typeof value!=="string") continue;
      try {
        const p=JSON.parse(value) as Record<string,unknown>;
        if(typeof p.caseId!=="string" || !known.has(p.caseId) || typeof p.date!=="string" ||
           Number.isNaN(Date.parse(p.date)) || !p.ratings || typeof p.ratings!=="object")continue;
        const ratings=p.ratings as Record<string,unknown>;
        if(CRITERIA.some(k=>!Number.isInteger(ratings[k]) || Number(ratings[k])<1 || Number(ratings[k])>5))continue;
        reviews.push({
          caseId:p.caseId,
          date:p.date,
          provider:p.provider==="openai"?"openai":"gemini",
          ratings:Object.fromEntries(CRITERIA.map(k=>[k,Number(ratings[k])])) as StoredReview["ratings"],
          note:typeof p.note==="string"?p.note.slice(0,800):"",
        });
      }catch{/* Ignore invalid historical entries. */}
    }
    const average=(items:StoredReview[],key:RatingName):number|null=>
      items.length===0?null:Math.round(100*items.reduce((s,x)=>s+x.ratings[key],0)/items.length)/100;
    const summarize=(items:StoredReview[])=>({
      total:items.length,
      average:items.length ? Math.round(100*
        items.reduce((s,x)=>s+CRITERIA.reduce((n,k)=>n+x.ratings[k],0)/CRITERIA.length,0)
        /items.length)/100:null,
      criteria:Object.fromEntries(CRITERIA.map(k=>[k,average(items,k)])),
    });
    return NextResponse.json({
      overall:summarize(reviews),
      byCase:TEST_CASES.map(x=>({id:x.id,title:x.title,...summarize(reviews.filter(v=>v.caseId===x.id))})),
      byProvider:[{id:"gemini",...summarize(reviews.filter(v=>v.provider==="gemini"))},
                  {id:"openai",...summarize(reviews.filter(v=>v.provider==="openai"))}],
      // Observations sont affichées uniquement à une session interne authentifiée.
      recent:reviews.slice(0,20),
      retentionDays:30,
      maxRecords:200,
    },{headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }catch{
    return NextResponse.json({error:"Impossible de charger les évaluations."},{status:503,
      headers:{"Cache-Control":"no-store"}});
  }
}
