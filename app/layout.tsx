import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OPPY by oaraxoom — Ton potentiel mérite la bonne opportunité",
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
