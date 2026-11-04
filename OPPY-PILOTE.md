# OPPY — Procédure de configuration du pilote privé

Produit développé par **oraxoom**.

## Prérequis

Le code de l'analyse gratuite est préparé, mais l'appel IA demeure **désactivé par défaut**. Ne pas définir `OPPY_PILOT_AI_ENABLED=true` tant que le quota partagé, le suivi des dépenses et les tests n'ont pas été vérifiés.

1. Créer une base **Upstash Redis** via le Marketplace Vercel (ou Upstash directement).
2. Configurer les variables ci-dessous **dans Vercel → Project → Settings → Environment Variables**, jamais dans GitHub ni dans le chat :
   - `UPSTASH_REDIS_REST_URL` : URL HTTPS du stockage Redis.
   - `UPSTASH_REDIS_REST_TOKEN` : jeton secret REST, uniquement côté serveur.
   - `OPPY_QUOTA_SECRET` : secret aléatoire côté serveur d'au moins 24 caractères, stable entre les déploiements.
   - `OPPY_MONTHLY_AI_LIMIT` : plafond de réservations mensuelles (par exemple `30` pour les tests privés).
   - `GEMINI_API_KEY` : clé API Gemini, uniquement côté serveur.
   - `OPPY_PILOT_AI_ENABLED` : `false` au début ; activer seulement après vérification.
3. Maintenir Vercel Authentication / Deployment Protection durant le pilote.
4. Procéder à un nouveau déploiement pour prendre en compte les variables modifiées.

## Logique du quota d'essai

- Une seule réservation gratuite par empreinte HMAC de l'**adresse IP**, durant 180 jours.
- Quota global mensuel conservé dans Redis, avec incrémentation atomique Lua EVAL.
- En cas d'indisponibilité du stockage Redis, l'analyse est refusée **avant** l'appel au modèle IA.
- Ni le CV ni l'offre ne sont stockés dans Redis par ce mécanisme.
- Le quota est consommé à la **réservation** ; une erreur ultérieure du fournisseur IA ne le rembourse pas encore.
- La méthode IP est imparfaite : des personnes partageant la même IP peuvent être bloquées, et des changements d'adresse peuvent permettre plusieurs essais.
- Mettre à jour les informations de confidentialité, la politique de conservation et le dispositif anti-abus avant ouverture publique.
- Les appels `/api/optimize`, `/api/export` et `/api/export-pdf` restent bloqués tant que le contrôle d'achat n'existe pas.

## Vérifications obligatoires

- Test PDF et DOCX fictifs : extraction puis correction du texte par l'utilisateur.
- Test 1 : première analyse autorisée lorsque toutes les variables sont configurées.
- Test 2 : deuxième demande sur la même adresse IP → 429 sans nouveau coût IA.
- Test 3 : plafond global atteint → 429 sans appel IA.
- Test 4 : stockage Redis inaccessible → 503 sans appel IA.
- Test 5 : POST sans droit sur export PDF/Word et optimisation → 503.
- Vérifier les journaux d'erreurs sans CV ni annonce personnelle.
- Vérifier le budget réel dans les tableaux de bord des prestataires.

## Fonctionnalités restant à construire

- Extraction des offres par URL (protection SSRF, redirections et limites de taille).
- Connexion Google, droits d'achat et paiement FedaPay vérifié côté serveur.
- Édition interactive du CV, prévisualisation sans export, et rapports téléchargeables.
- Conservation des documents avec consentement et suppression.
- Analyse gratuite par véritable personne ou compte, plutôt que par IP, si besoin d'un contrôle robuste.
