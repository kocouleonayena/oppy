"use client";
import { useEffect, useState } from "react";
import { TEST_CASES } from "@/lib/testCases";

type Criterion = "fidelity"|"relevance"|"actionability"|"clarity"|"context";
type Summary={total:number;average:number|null;criteria:Record<Criterion,number|null>};
type Feedback={caseId:string;date:string;provider:"gemini"|"openai";ratings:Record<Criterion,number>;note:string};
type Dashboard={
  overall:Summary;
  byCase:Array<Summary&{id:string;title:string}>;
  byProvider:Array<Summary&{id:string}>;
  recent:Feedback[];
  retentionDays:number;
  maxRecords:number;
};
const criteria:{id:Criterion;name:string}[]=[
 {id:"fidelity",name:"Fidélité aux documents"},
 {id:"relevance",name:"Pertinence des scores"},
 {id:"actionability",name:"Utilité des conseils"},
 {id:"clarity",name:"Clarté"},
 {id:"context",name:"Contextualisation"},
];
function format(value:number|null) {return value===null?"—":value.toLocaleString("fr-FR",{maximumFractionDigits:2})+"/5";}
function Bar({value}:{value:number|null}) {
 return <div className="team-qa-bar" aria-label={value===null?"Pas de note":`${value} sur 5`}>
   <span style={{width:`${value===null?0:Math.max(0,Math.min(100,value/5*100))}%`}}/>
 </div>;
}
export default function QualityDashboard({revision=0}:{revision?:number}) {
 const [data,setData]=useState<Dashboard|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [open,setOpen]=useState(true);
 async function load() {
   setLoading(true);setError("");
   try{
     const res=await fetch("/api/test/feedback",{method:"GET",cache:"no-store",credentials:"same-origin"});
     const json=await res.json().catch(()=>null);
     if(!res.ok)throw Error(json?.error||"Échec de lecture des évaluations.");
     setData(json as Dashboard);
   }catch(err){setError(err instanceof Error?err.message:"Données indisponibles.");}
   finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[revision]);
 return <section className="team-panel" aria-label="Tableau de bord qualité">
   <div className="team-qa-heading"><div><h2>Tableau de bord qualité</h2>
   <p>Suivi des évaluations enregistrées, sans données personnelles ni rapports.</p></div>
   <div className="team-qa-controls">
     <button className="team-secondary" onClick={()=>setOpen(v=>!v)}>{open?"Réduire":"Afficher"}</button>
     <button className="team-secondary" disabled={loading} onClick={()=>void load()}>{loading?"Chargement…":"Actualiser"}</button>
   </div></div>
   {open&&<>
     {error&&<p className="error" role="alert">{error}</p>}
     {loading&&!data&&<p>Lecture des évaluations…</p>}
     {data&&<>
       <div className="team-qa-cards">
         <div><small>Évaluations enregistrées</small><strong>{data.overall.total}</strong></div>
         <div><small>Note moyenne globale</small><strong>{format(data.overall.average)}</strong></div>
         <div><small>Scénarios couverts</small><strong>{data.byCase.filter(x=>x.total>0).length}/{TEST_CASES.length}</strong></div>
       </div>
       {data.overall.total===0?<p className="team-qa-empty">Aucune grille enregistrée pour le moment. Lance un test, évalue le rapport et enregistre les cinq notes pour alimenter ce tableau.</p>:<>
       <h3>Scores moyens par critère</h3>
       <div className="team-qa-criteria">
         {criteria.map(c=><div className="team-qa-criterion" key={c.id}>
           <div><strong>{c.name}</strong><span>{format(data.overall.criteria[c.id])}</span></div>
           <Bar value={data.overall.criteria[c.id]}/>
         </div>)}
       </div>
       <h3>Résultats par scénario</h3>
       <div className="team-qa-table-wrap">
         <table className="team-qa-table">
           <thead><tr><th scope="col">Scénario</th><th scope="col">Grilles</th><th scope="col">Moyenne</th></tr></thead>
           <tbody>{data.byCase.map(item=><tr key={item.id}>
             <td>{item.title}</td><td>{item.total}</td><td>{format(item.average)}</td>
           </tr>)}</tbody>
         </table>
       </div>
       <h3>Par fournisseur IA</h3>
       <div className="team-qa-provider">
         {data.byProvider.map(x=><div key={x.id}><strong>{x.id==="gemini"?"Google Gemini":"OpenAI (secours)"}</strong>
           <span>{x.total} évaluation{x.total>1?"s":""} · {format(x.average)}</span></div>)}
       </div>
       <h3>Dernières observations</h3>
       {data.recent.some(x=>x.note.length>0)?<ul className="team-qa-notes">
         {data.recent.filter(x=>x.note.length>0).slice(0,10).map((x,i)=><li key={x.date+"-"+i}>
           <small>{new Date(x.date).toLocaleDateString("fr-FR")} · {TEST_CASES.find(c=>c.id===x.caseId)?.title??x.caseId} · {x.provider}</small>
           <p>{x.note}</p>
         </li>)}
       </ul>:<p>Aucune observation rédigée.</p>}
       </>}
       <p className="team-qa-footnote">Données conservées pendant {data.retentionDays} jours, sur un maximum de {data.maxRecords} grilles. Une moyenne ne remplace pas la revue humaine des rapports. Une évaluation n'est pas un test de performance technique.</p>
     </>}
   </>}
 </section>;
}
