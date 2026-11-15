import { parseLenientJson } from "@/lib/lenientJson";

const dimensions = ["adequation","competences","experiences","presentation","valorisation"] as const;
function object(value: unknown): Record<string,unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string,unknown> : null;
}
function listOfStrings(value:unknown):boolean {
  return Array.isArray(value) && value.every(item=>typeof item==="string");
}
/** Reject partially valid reports rather than silently filling missing dimensions with 0. */
export function validateReport(raw:string): unknown {
  const parsed=parseLenientJson(raw);
  const obj=object(parsed);
  if(!obj) throw new Error("not-an-object");
  const dims=object(obj.dimensions);
  if(!dims) throw new Error("missing-dimensions");
  for(const key of dimensions) {
    const item=object(dims[key]);
    if(!item || typeof item.score!=="number" || !Number.isFinite(item.score) ||
      item.score<0 || item.score>100 ||
      typeof item.justification!=="string" || item.justification.trim().length<12
    ) throw new Error("invalid-dimension");
  }
  const ctx=object(obj.contexte);
  if(!ctx || ["pays","secteur","typeRecruteur"].some(k=>typeof ctx[k]!=="string") ||
    !listOfStrings(ctx.incertitudes)) throw new Error("invalid-context");
  if(!listOfStrings(obj.pointsForts) ||
    !listOfStrings(obj.motsClesManquants) ||
    !listOfStrings(obj.recommandations) ||
    !listOfStrings(obj.questions) ||
    !Array.isArray(obj.problemes) ||
    !obj.problemes.every(p=>{const x=object(p);return !!x &&
      ["élevée","moyenne","faible"].includes(String(x.severite)) &&
      typeof x.texte==="string";})
  ) throw new Error("invalid-lists");
  if(typeof obj.avertissement!=="string") throw new Error("invalid-warning");
  return parsed;
}
