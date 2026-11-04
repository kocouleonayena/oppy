"use client";

import { useRef, useState } from "react";
import AtsGuide from "./AtsGuide";
import ScanReport from "./ScanReport";
import type { ScanResult } from "@/lib/scanPrompt";
import { cvContentToText, type CvContent } from "@/lib/prompt";

// Styles de template PDF disponibles.
type PdfStyle = "moderne" | "finance" | "minimal";
const PDF_STYLES: { id: PdfStyle; label: string; hint: string }[] = [
  { id: "moderne", label: "Moderne sobre", hint: "Sans-serif, touche bleu marine" },
  { id: "finance", label: "Finance classique", hint: "Serif, nom centré, filets N&B" },
  { id: "minimal", label: "Minimal aéré", hint: "Sans-serif, beaucoup de blanc" },
];

export default function Home() {
  const [cv, setCv] = useState("");
  const [annonce, setAnnonce] = useState("");
  const [result, setResult] = useState<CvContent | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false); // optimisation
  const [scanLoading, setScanLoading] = useState(false); // scan
  const [importing, setImporting] = useState(false); // import de fichier
  const [downloading, setDownloading] = useState(false); // export .docx
  const [downloadingPdf, setDownloadingPdf] = useState(false); // export .pdf
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>("moderne");
  const [notice, setNotice] = useState(""); // message de confirmation d'import
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rendu texte brut copiable, reconstruit proprement depuis le JSON structuré.
  const resultText = result ? cvContentToText(result) : "";

  const busy = loading || scanLoading || importing;
  // OPPY compare obligatoirement le CV à une opportunité.
  const canOptimize = cv.trim().length > 0 && annonce.trim().length > 0 && !busy;
  const canScan = cv.trim().length > 0 && annonce.trim().length > 0 && !busy;

  async function handleOptimize() {
    setLoading(true);
    setError("");
    setResult(null);
    setScanResult(null);
    setCopied(false);

    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv, annonce }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Une erreur est survenue.");
        return;
      }

      setResult((data.result as CvContent) ?? null);
    } catch {
      setError("Impossible de contacter le serveur. Réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function handleScan() {
    setScanLoading(true);
    setError("");
    setScanResult(null);
    setResult(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv, annonce }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Une erreur est survenue.");
        return;
      }

      setScanResult(data.result ?? null);
    } catch {
      setError("Impossible de contacter le serveur. Réessaie.");
    } finally {
      setScanLoading(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // On réinitialise l'input tout de suite pour pouvoir réimporter le même
    // fichier deux fois de suite (sinon onChange ne se redéclenche pas).
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setError("");
    setNotice("");

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Import impossible.");
        return;
      }

      // On remplit la zone CV : l'utilisateur peut relire/corriger ensuite.
      setCv(data.text ?? "");
      setNotice(
        `Texte importé depuis « ${file.name} ». Relis-le et corrige si besoin avant d'optimiser ou scanner.`
      );
    } catch {
      setError("Impossible de contacter le serveur pour l'import. Réessaie.");
    } finally {
      setImporting(false);
    }
  }

  async function handleCopy() {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copie impossible dans ce navigateur.");
    }
  }

  async function handleDownloadDocx() {
    if (!result) return;
    setDownloading(true);
    setError("");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: result }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Le téléchargement a échoué.");
        return;
      }

      // On récupère le fichier binaire et on déclenche le téléchargement.
      const blob = await res.blob();
      triggerDownload(blob, "cv-optimise.docx");
    } catch {
      setError("Impossible de générer le fichier. Réessaie.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!result) return;
    setDownloadingPdf(true);
    setError("");
    try {
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: result, style: pdfStyle }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Le téléchargement PDF a échoué.");
        return;
      }

      const blob = await res.blob();
      triggerDownload(blob, `cv-optimise-${pdfStyle}.pdf`);
    } catch {
      setError("Impossible de générer le PDF. Réessaie.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  // Déclenche le téléchargement d'un blob dans le navigateur (rien n'est stocké).
  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="container">
      <header className="header">
        <p className="oppy-label">UN PRODUIT ORAXOOM · VERSION DE DÉVELOPPEMENT</p>
        <h1>oppy</h1>
        <h2 className="oppy-headline">Ton potentiel mérite la bonne opportunité.</h2>
        <p className="subtitle">
          Importe ton CV en PDF ou Word, puis colle le texte de l&apos;offre visée.
          Vérifie tes informations avant de lancer l&apos;analyse. OPPY t&apos;aide
          à mieux présenter ton parcours, sans inventer tes expériences.
        </p>
      </header>

      <section className="grid">
        <div className="field">
          <div className="cv-label-row">
            <label htmlFor="cv">Ton CV</label>
            <button
              type="button"
              className="import-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              {importing ? "Import en cours…" : "Importer un fichier"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleImport}
              hidden
            />
          </div>
          <textarea
            id="cv"
            value={cv}
            onChange={(e) => setCv(e.target.value)}
            placeholder="Importe un fichier PDF ou Word. Tu pourras ici vérifier et corriger les informations extraites."
            rows={16}
          />
          {notice && <p className="notice">{notice}</p>}
        </div>

        <div className="field">
          <label htmlFor="annonce">
            Le texte de l&apos;opportunité
          </label>
          <textarea
            id="annonce"
            value={annonce}
            onChange={(e) => setAnnonce(e.target.value)}
            placeholder="Colle ici le texte de l'annonce ciblée…"
            rows={16}
          />
        </div>
      </section>

      <div className="actions">
        <button onClick={handleOptimize} disabled={!canOptimize} className="primary">
          {loading ? "Optimisation en cours…" : "Prévisualiser le CV amélioré"}
        </button>
        <button onClick={handleScan} disabled={!canScan} className="primary secondary-action">
          {scanLoading ? "Scan en cours…" : "Analyser ma candidature"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {scanResult && <ScanReport data={scanResult} />}

      {result && (
        <section className="field result-block">
          <div className="result-head">
            <label htmlFor="result">Résultat optimisé</label>
            <button onClick={handleCopy} className="secondary" disabled title="Copie indisponible pendant la phase de configuration">
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
          <textarea id="result" value={resultText} readOnly rows={22} />

          {/* Sélecteur de style de template PDF */}
          <fieldset className="pdf-styles">
            <legend>Style du PDF</legend>
            <div className="pdf-styles-options">
              {PDF_STYLES.map((s) => (
                <label
                  key={s.id}
                  className={`pdf-style-option${
                    pdfStyle === s.id ? " is-selected" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="pdfStyle"
                    value={s.id}
                    checked={pdfStyle === s.id}
                    onChange={() => setPdfStyle(s.id)}
                  />
                  <span className="pdf-style-label">{s.label}</span>
                  <span className="pdf-style-hint">{s.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="result-actions">
            <button
              onClick={handleDownloadDocx}
              disabled={true}
              className="primary secondary-action"
            >
              {downloading ? "Génération…" : "Export Word bientôt disponible — 500 FCFA"}
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={true}
              className="primary"
            >
              {downloadingPdf ? "Génération…" : "Export PDF bientôt disponible — 500 FCFA"}
            </button>
          </div>
        </section>
      )}

      <p className="oppy-warning">Prototype technique : les cinq scores OPPY, l’accès par URL, le quota gratuit et les paiements FedaPay ne sont pas encore intégrés. Ne pas ouvrir au public.</p>
      <AtsGuide />
    </main>
  );
}
