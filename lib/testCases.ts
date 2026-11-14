export type TestCase = {id:string;title:string;expected:string[];cv:string;annonce:string};
/** Cas strictement fictifs, ne pas utiliser de données personnelles. */
export const TEST_CASES: TestCase[] = [
  {
    "id": "junior",
    "title": "Juriste junior — Bénin",
    "expected": [
      "Valoriser stages et recherche OHADA",
      "Distinguer preuve et absence réelle",
      "Recommander des précisions sans inventer"
    ],
    "cv": "CANDIDATE FICTIVE. Master en droit des affaires à Cotonou. Stage de trois mois dans un cabinet fictif : recherche d'Actes uniformes OHADA, classement des pièces, préparation de notes sous supervision. Bénévolat : sensibilisation universitaire, coordination d'ateliers. Compétences : Word, Excel, rédaction de synthèses, recherche juridique. Anglais intermédiaire. Aucun contentieux géré en autonomie n'est mentionné.",
    "annonce": "OFFRE FICTIVE — ASSISTANTE JURIDIQUE, COTONOU, BÉNIN. Cabinet fictif. Missions : recherches OHADA, préparation de notes, organisation des pièces et échéances, rédaction de courriers. Exigences essentielles : Master en droit, recherche juridique, outils bureautiques. Atouts : stage en cabinet, anglais et connaissance du recouvrement. Débutants acceptés."
  },
  {
    "id": "mismatch",
    "title": "Communication vers conformité — Bénin",
    "expected": [
      "Ne pas affirmer que le candidat ne possède aucun diplôme juridique",
      "Mentionner les compétences transférables",
      "Proposer de vraies améliorations du CV"
    ],
    "cv": "CANDIDAT FICTIF. Licence en communication. 2023-2025 chargé de communication dans une agence fictive : planification de campagnes, coordination des prestataires et rapports d'activité. 2021-2023 assistant événementiel : conférences, budgets et partenaires. Compétences : gestion de projets, Excel, rédaction de synthèses. Aucun diplôme juridique ni pratique de rédaction contractuelle n'est mentionné.",
    "annonce": "OFFRE FICTIVE — JURISTE CONFORMITÉ, PORTO-NOVO, BÉNIN. Entreprise fictive. Missions : veille réglementaire, préparation de contrats, risques de conformité, procédures internes. Exigences essentielles : Master en droit, deux années d'expérience juridique ou conformité, rédaction contractuelle. Atouts : coordination et Excel."
  },
  {
    "id": "ngo",
    "title": "Projet associatif — Sénégal",
    "expected": [
      "Reconnaître bénévolat et travail indépendant",
      "Distinguer budget et anglais non démontrés",
      "Suggérer comment préciser les réalisations"
    ],
    "cv": "CANDIDATE FICTIVE. Licence en sciences sociales. 2024-2026 coordination bénévole d'une association fictive : planification de rencontres, suivi des volontaires, comptes rendus. 2022-2024 formation numérique indépendante : ateliers de bureautique. Projet : mentorat de jeunes diplômés. Compétences : suivi d'activités, facilitation, Word, Excel, français. Expérience budgétaire et niveau d'anglais non précisés.",
    "annonce": "OFFRE FICTIVE — ASSISTANTE DE PROJET, DAKAR, SÉNÉGAL. ONG fictive. Missions : organiser des ateliers, suivre les partenaires, contribuer aux rapports trimestriels, documenter les résultats. Exigences : diplôme supérieur en sciences sociales ou gestion, coordination d'activités, rédaction. Atouts : budget, anglais professionnel, expérience associative."
  }
];
