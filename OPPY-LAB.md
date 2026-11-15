# OPPY Lab — protocole de test interne (oraxoom)

## Objectif
Comparer la qualité des rapports OPPY sur des scénarios fictifs avant l'ouverture au public. Ce laboratoire est **séparé de la première analyse gratuite** : aucun cookie d'équipe ni paramètre client ne doit contourner le quota public.

## Configuration obligatoire sur Vercel
Projet `oppy` → Settings → Environment Variables → **Preview**, pour la branche `feature/oppy-interface-v1` :

- `OPPY_INTERNAL_TESTS_ENABLED=true` (déjà prévu en Preview).
- `OPPY_TEAM_MONTHLY_LIMIT=12` (déjà prévu en Preview).
- `OPPY_TEST_ACCESS_CODE` : valeur **Sensitive**, code fort aléatoire d'au moins 24 caractères. **Ne jamais le committer dans GitHub, le mettre dans une URL ou l'envoyer dans une conversation.** Il sert à ouvrir une session signée HttpOnly de 8 heures.
- `OPPY_QUOTA_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `GEMINI_API_KEY` : prérequis déjà utilisés pour le pilote, à vérifier sans révéler les valeurs.
- `OPENAI_API_KEY` : facultative pour le secours OpenAI.
- Vérifier que Vercel Deployment Protection reste activée pour les prévisualisations.

**Ne pas configurer les variables de test en Production.** La route /test est inactive si `VERCEL_ENV` n'est pas `preview`.

## Test
1. Ouvrir `https://<url-preview>/test` depuis une prévisualisation de la branche.
2. Saisir le code d'équipe (5 tentatives maximum par adresse réseau / 15 minutes, via Upstash).
3. Choisir l'un des trois scénarios totalement fictifs.
4. Inspecter le CV et l'offre présentés ; cocher l'accord aux deux fournisseurs IA.
5. Lancer l'analyse (les essais sont réservés sur un compteur **distinct**).
6. Comparer le rapport aux attentes explicites du scénario.
7. Évaluer les cinq critères avec une note de 1 à 5 et une observation facultative.
8. Enregistrer la grille.

## Grille de notation
| Critère | 1 / 5 | 3 / 5 | 5 / 5 |
|---|---|---|---|
| Fidélité aux faits | Faits inventés ou exigences non présentes | Quelques approximations | Strictement fondé sur les documents |
| Pertinence des scores | Incohérences majeures | Scores globalement plausibles | Notes cohérentes et justifications étayées |
| Recommandations exploitables | Généralités | Conseils utiles mais vagues | Actions précises, priorisées, réalisables |
| Clarté | Confus ou catégorique | Lisible mais répétitif | Langage clair, accessible et mesuré |
| Contexte | Ignore le pays et les parcours | Contextualisation partielle | Prend en compte contexte, stages, bénévolat, compétences transférables |

**Règle de validation proposée :** aucun fait inventé ; moyenne au moins 4/5 sur chaque critère pour plusieurs scénarios, après revue humaine. Les chiffres sont des objectifs internes, non des performances constatées.

## Quotas et sécurité
- Le quota public (une analyse gratuite par connexion réseau, régime pilote) reste inchangé.
- Le quota équipe est `oppy:team:month:AAAA-MM` dans Upstash et compte les **tentatives**, même quand le fournisseur IA échoue, afin de plafonner les dépenses.
- Les tentatives équipe utilisent un verrou éphémère de 180 secondes par session ; une seule requête simultanée par session.
- Aucun CV, offre ou rapport généré n'est stocké par le formulaire d'évaluation.
- Seuls les notes 1–5, l'identifiant du scénario fictif, le fournisseur utilisé, la date et l'observation facultative sont conservés dans Redis pour 30 jours.
- Ne jamais coller d'informations personnelles dans les observations. Les jeux de test sont fictifs et peuvent figurer dans le dépôt public.
- Les clés API et le code d'équipe restent dans Vercel. Changer le code et le secret de session si un accès non autorisé est suspecté.
- Un code partagé est un mécanisme **temporaire** ; pour une équipe élargie, remplacer par Google OAuth, rôles individuels, audit et révocation.

## Limites connues
Le statut « READY » de Vercel atteste d'une compilation aboutie, pas de la pertinence des résultats. Les analyses consomment des appels API facturables ; vérifier la consommation des deux fournisseurs. La base Redis ne constitue pas une limite de facturation garantie en monnaie.

La grille enregistre les appréciations, mais la visualisation agrégée et l'export des évaluations vers un tableau de bord ne sont pas encore inclus dans cette première version.
