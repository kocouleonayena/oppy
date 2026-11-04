import type { ScanResult, DimensionKey } from "@/lib/scanPrompt";

const items: {key: DimensionKey; label: string}[] = [
 {key:"adequation",label:"Adéquation à l'offre"},
 {key:"competences",label:"Compétences"},
 {key:"experiences",label:"Expériences"},
 {key:"presentation",label:"Présentation"},
 {key:"valorisation",label:"Valorisation du parcours"},
];

export default function ScanReport({data}:{data:ScanResult}) {
  return <section className="oppy-report" aria-label="Rapport OPPY">
    <div className="oppy-report-header">
      <div><p className="oppy-report-kicker">Diagnostic indicatif</p><h2>Ton rapport OPPY</h2></div>
      <div className="oppy-score">{data.score}<small>/100</small></div>
    </div>
    <p className="oppy-disclaimer">Ce score ne mesure ni tes chances d'embauche ni le résultat d'un ATS réel.</p>
    <div className="oppy-context">
      <p><strong>Pays :</strong> {data.contexte.pays}</p>
      <p><strong>Secteur :</strong> {data.contexte.secteur}</p>
      <p><strong>Recruteur :</strong> {data.contexte.typeRecruteur}</p>
    </div>
    {data.contexte.incertitudes.length > 0 && <p className="oppy-disclaimer">À confirmer : {data.contexte.incertitudes.join(" ; ")}</p>}
    <h3>Les cinq dimensions</h3>
    {items.map(item => {
      const d=data.dimensions[item.key];
      return <div className="oppy-dimension" key={item.key}>
        <div className="oppy-dimension-title"><strong>{item.label}</strong><span>{d.score}/100</span></div>
        <div className="oppy-progress"><span style={{width:`${d.score}%`}}/></div>
        <p>{d.justification}</p>
      </div>;
    })}
    {data.pointsForts.length > 0 && <section className="oppy-section"><h3>Points forts</h3><ul>{data.pointsForts.map((s,i)=><li key={i}>{s}</li>)}</ul></section>}
    {data.problemes.length > 0 && <section className="oppy-section"><h3>Points à améliorer</h3><ul>{data.problemes.map((s,i)=><li key={i}>{s.texte}</li>)}</ul></section>}
    {data.motsClesManquants.length > 0 && <section className="oppy-section"><h3>Exigences non démontrées dans le CV</h3><ul>{data.motsClesManquants.map((s,i)=><li key={i}>{s}</li>)}</ul></section>}
    {data.recommandations.length > 0 && <section className="oppy-section"><h3>Recommandations</h3><ol>{data.recommandations.map((s,i)=><li key={i}>{s}</li>)}</ol></section>}
    {data.questions.length > 0 && <section className="oppy-section"><h3>Questions pour compléter ton parcours</h3><ol>{data.questions.map((s,i)=><li key={i}>{s}</li>)}</ol></section>}
    <p className="oppy-disclaimer">{data.avertissement}</p>
  </section>;
}
