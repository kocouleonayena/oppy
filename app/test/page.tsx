"use client";

import { useEffect, useState } from "react";
import ScanReport from "../ScanReport";
import type { ScanResult } from "@/lib/scanPrompt";
import { TEST_CASES } from "@/lib/testCases";

type Ratings = Record<"fidelity"|"relevance"|"actionability"|"clarity"|"context",number>;
const CRITERIA: {key:keyof Ratings;label:string;help:string}[]=[
 {key:"fidelity",label:"Fidélité aux documents",help:"Pas de faits ou d'exigences inventés"},
 {key:"relevance",label:"Pertinence des cinq scores",help:"Notes cohérentes avec CV et offre"},
 {key:"actionability",label:"Conseils exploitables",help:"Actions précises et réalisables"},
 {key:"clarity",label:"Clarté du rapport",help:"Langage compréhensible et mesuré"},
 {key:"context",label:"Prise en compte du contexte",help:"Pays, diplômes et expériences adaptés"},
];
const emptyRatings=():Ratings=>({fidelity:0,relevance:0,actionability:0,clarity:0,context:0});

export default function InternalTestPage() {
 const [enabled,setEnabled]=useState(false);
 const [authenticated,setAuthenticated]=useState(false);
 const [loadingSession,setLoadingSession]=useState(true);
 const [code,setCode]=useState("");
 const [caseId,setCaseId]=useState(TEST_CASES[0].id);
 const [consent,setConsent]=useState(false);
 const [report,setReport]=useState<ScanResult|null>(null);
 const [provider,setProvider]=useState<"gemini"|"openai">("gemini");
 const [busy,setBusy]=useState(false);
 const [saving,setSaving]=useState(false);
 const [ratings,setRatings]=useState<Ratings>(emptyRatings());
 const [note,setNote]=useState("");
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [quota,setQuota]=useState<{used:number;limit:number}|null>(null);
 const sample=TEST_CASES.find(x=>x.id===caseId) || TEST_CASES[0];

 async function refresh() {
   try {
     const res=await fetch("/api/test/session",{cache:"no-store"});
     const data=await res.json();
     setEnabled(data.enabled===true);
     setAuthenticated(data.authenticated===true);
     setQuota(data.usage || null);
   }catch{setError("Impossible de vérifier la session d'équipe.");}
   finally {setLoadingSession(false);}
 }
 useEffect(()=>{void refresh();},[]);

 async function login(event:React.FormEvent<HTMLFormElement>) {
   event.preventDefault();setBusy(true);setError("");
   try {
     const res=await fetch("/api/test/session",{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({code}),
     });
     const data=await res.json();
     if(!res.ok) throw Error(data.error||"Connexion refusée.");
     setCode("");setAuthenticated(true);
     await refresh();
   }catch(err){setError(err instanceof Error?err.message:"Échec de connexion.");}
   finally{setBusy(false);}
 }
 async function logout() {
   await fetch("/api/test/session",{method:"DELETE"});
   setAuthenticated(false);setReport(null);setQuota(null);setMessage("");
 }
 async function analyze() {
   if(!consent)return;
   setBusy(true);setError("");setMessage("");setReport(null);setRatings(emptyRatings());
   try {
     const res=await fetch("/api/scan",{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({cv:sample.cv,annonce:sample.annonce,aiProvidersConsent:true,internalTest:true}),
     });
     const data=await res.json().catch(()=>null);
     if(!res.ok) throw Error(data?.error||"Le serveur n'a pas répondu correctement.");
     if(!data?.result)throw Error("Rapport absent.");
     setReport(data.result as ScanResult);
     setProvider(data.provider==="openai"?"openai":"gemini");
     setMessage("Analyse reçue. Évalue maintenant le rapport avec la grille ci-dessous.");
     await refresh();
   }catch(err){setError(err instanceof Error?err.message:"Analyse impossible.");await refresh();}
   finally{setBusy(false);}
 }
 async function submitReview() {
   if(!report || CRITERIA.some(x=>ratings[x.key]===0))return;
   setSaving(true);setError("");setMessage("");
   try {
     const res=await fetch("/api/test/feedback",{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({caseId,ratings,note,provider}),
     });
     const data=await res.json().catch(()=>null);
     if(!res.ok)throw Error(data?.error||"Enregistrement impossible.");
     setMessage("Grille enregistrée sans CV, sans offre et sans rapport nominatif.");
   }catch(err){setError(err instanceof Error?err.message:"Enregistrement impossible.");}
   finally{setSaving(false);}
 }
 if(loadingSession)return <main className="team-shell"><p>Vérification de l'accès de l'équipe…</p></main>;
 return <main className="team-shell">
   <div className="team-heading">
     <div><p className="oppy-label">ORAXOOM · LABORATOIRE PRIVÉ</p><h1>OPPY Lab</h1>
       <p>Espace de contrôle qualité réservé à l'équipe. Les tests utilisent uniquement des candidats et employeurs fictifs.</p></div>
     <a href="/">Retour à OPPY</a>
   </div>
   {!enabled ? <section className="team-panel"><h2>Accès interne non configuré</h2>
     <p>L'espace est désactivé tant que le secret de test et les paramètres Preview ne sont pas configurés dans Vercel. Aucun quota gratuit public n'est contourné.</p>
   </section> : !authenticated ? <section className="team-panel team-login">
     <h2>Accès à l'équipe</h2>
     <p>Saisis le code d'équipe configuré dans Vercel. Il n'est jamais transmis aux modèles d'IA.</p>
     <form onSubmit={login}>
       <label htmlFor="team-code">Code d'accès privé</label>
       <input id="team-code" type="password" autoComplete="off" value={code} onChange={e=>setCode(e.target.value)} required minLength={24}/>
       <button className="team-primary" disabled={busy || code.length<24}>{busy?"Vérification…":"Accéder aux tests"}</button>
     </form>
   </section> : <>
     <section className="team-panel team-topbar">
       <div><strong>Session d'équipe active</strong><p>Les essais utilisent un quota distinct du parcours gratuit.</p></div>
       <div className="team-top-actions"><span>{quota ? `${quota.used} / ${quota.limit} tentatives ce mois` : "Quota non disponible"}</span>
       <button onClick={logout} className="team-secondary">Se déconnecter</button></div>
     </section>
     <section className="team-panel">
       <h2>1. Choisir un scénario fictif</h2>
       <div className="team-cases">
         {TEST_CASES.map(x=><button key={x.id} className={caseId===x.id?"team-case active":"team-case"}
          onClick={()=>{setCaseId(x.id);setReport(null);setMessage("");setRatings(emptyRatings());}} disabled={busy}>
           {x.title}
         </button>)}
       </div>
       <details><summary>Voir le CV et l'offre fictifs</summary>
         <h3>CV fictif</h3><pre className="team-document">{sample.cv}</pre>
         <h3>Annonce fictive</h3><pre className="team-document">{sample.annonce}</pre>
       </details>
       <h3>Ce que le rapport devrait vérifier</h3>
       <ul>{sample.expected.map((line,i)=><li key={i}>{line}</li>)}</ul>
       <label className="team-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
         J'accepte que ces données fictives soient traitées par Gemini et, si nécessaire, OpenAI pour le test.</label>
       <button onClick={analyze} disabled={!consent||busy} className="team-primary">{busy?"Analyse en cours…":"Lancer le test sans consommer le quota public"}</button>
     </section>
     {report && <>
       <section className="team-panel"><p className="team-provider">Analyse fournie par {provider==="gemini"?"Gemini":"OpenAI (secours)"}</p>
         <ScanReport data={report}/></section>
       <section className="team-panel">
         <h2>2. Évaluer ce rapport</h2>
         <p>Note chaque critère de 1 (insuffisant) à 5 (excellent). Ne saisis aucun nom, CV réel ni autre donnée personnelle dans les observations.</p>
         <div className="team-ratings">{CRITERIA.map(x=><div key={x.key} className="team-rating">
           <div><strong>{x.label}</strong><small>{x.help}</small></div>
           <select aria-label={x.label} value={ratings[x.key]} onChange={e=>setRatings(prev=>({...prev,[x.key]:Number(e.target.value)}))}>
             <option value="0">À noter</option>
             {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}/5</option>)}
           </select>
         </div>)}</div>
         <label htmlFor="team-note">Observation qualitative (facultative)</label>
         <textarea id="team-note" value={note} onChange={e=>setNote(e.target.value)} maxLength={800} rows={4}
           placeholder="Ex. : la recommandation n° 2 ne précise pas quel passage du CV renforcer."/>
         <button className="team-primary" disabled={saving||CRITERIA.some(x=>ratings[x.key]===0)} onClick={submitReview}>
           {saving?"Enregistrement…":"Enregistrer l'évaluation"}
         </button>
       </section>
     </>}
   </>}
   {error && <p className="error" role="alert">{error}</p>}
   {message && <p className="notice" role="status">{message}</p>}
   <p className="team-footer">OPPY by oraxoom · Essais internes · Les CV et les rapports ne sont pas enregistrés dans la grille d'évaluation.</p>
 </main>;
}
