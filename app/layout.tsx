import type { Metadata } from "next";
import "./globals.css";
import "./oppy-report.css";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "OPPY by oraxoom — Ton potentiel mérite la bonne opportunité",
  description:
    "Analyse et améliore ta candidature avec OPPY, l'assistant pensé pour l'Afrique francophone.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
