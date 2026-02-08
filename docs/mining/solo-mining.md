# SOLO Mining - Tout ou Rien

## C'est quoi le SOLO mining ?

En SOLO mining, quand un mineur trouve un bloc, il recoit **100% du reward** (moins la fee pool). Les autres mineurs ne recoivent rien pour ce bloc. C'est du "tout ou rien".

C'est l'oppose du PPLNS ou tout le monde partage. En SOLO, tu prends tout le risque mais aussi tout le gain.

## PPLNS vs SOLO - Comparaison complete

### 1. Ce qui est IDENTIQUE (protocole et infrastructure)

| Composant | PPLNS | SOLO | Identique ? |
|-----------|-------|------|:-----------:|
| Protocole Stratum | `mining.subscribe/authorize/notify/submit` | Identique | OUI |
| Vardiff | Ajustement cible 15s | Identique | OUI |
| Validation shares (Autolykos2) | `validateShare()` | Identique | OUI |
| Soumission bloc au noeud | `submitSolution()` | Identique | OUI |
| Logiciel mineur | lolMiner / TeamRedMiner | Identique | OUI |
| Calcul hashrate | `SUM(share_diff) * 1.08 / temps` | Identique | OUI |
| Workers tracking | Par `adresse.worker` | Identique | OUI |
| Shares stockage | Table `shares` | Identique | OUI |
| Confirmations | 720 blocs (~24h) | Identique | OUI |
| Paiement mecanisme | balance → tx groupee | Identique | OUI |
| pk dans le bloc | Cle publique de la pool | Identique | OUI |

**En resume** : le mineur utilise le **meme logiciel**, la **meme configuration**, le **meme protocole**. La seule difference visible pour lui est le **port de connexion** (ex: 3416 PPLNS, 3417 SOLO).

### 2. Ce qui est DIFFERENT (distribution et metriques)

| Composant | PPLNS | SOLO | Identique ? |
|-----------|-------|------|:-----------:|
| Shares → paiement | Proportionnel dans la fenetre PPLNS | INUTILE (shares ne servent pas au payout) | NON |
| Distribution reward | Partage entre N mineurs (fenetre PPLNS) | 100% au finder - fee | NON |
| Fee pool | 1% | 1.5% | NON |
| Effort calcul | Travail de TOUTE la pool vs diff reseau | Travail de CE MINEUR seul vs diff reseau | NON |
| Blocs affiches | Blocs de la pool | Blocs de CE mineur uniquement | NON |
| Frequence paiement | Chaque bloc pool (souvent, petits montants) | Chaque bloc du mineur (rare, gros montant) | NON |
| Temps estime pour un bloc | Pool entiere (rapide) | Par mineur (beaucoup plus long) | NOUVEAU |
| Effort mineur personnel | Non affiche | `% effort personnel vs reseau` | NOUVEAU |

## Comment ca marche dans Korvex ?

### Le flux complet

```
1. Le mineur se connecte en Stratum sur le port SOLO (3417)
   → La pool lui attribue miningMode = "solo" sur sa session

2. Le mineur soumet des shares normalement
   → Stockees dans la table shares avec mining_mode = "solo"
   → Servent au calcul du hashrate et de l'effort (pas au paiement)

3. Un share se revele etre un bloc valide !
   → La pool identifie le gagnant via session.address
   → Au lieu d'appeler distributePPLNS(), elle appelle distributeSolo()

4. Distribution SOLO :
   → Reward total : 3 ERG
   → Fee pool (1.5%) : 0.045 ERG
   → Credit au mineur gagnant : 2.955 ERG

5. Attente 720 confirmations (~24h)
   → Apres confirmation, la balance est creditee
   → Paiement automatique quand balance >= seuil
```

### Pourquoi la pool est intermediaire ?

Le noeud Ergo genere le bloc candidat avec **sa propre cle publique** (celle configuree dans `ergo.conf`). C'est le noeud qui decide quelle adresse recoit le reward on-chain.

```
Noeud Ergo → genere candidat avec pk = cle de la pool
Mineur     → resout le puzzle
Bloc mine  → reward arrive a l'adresse de la POOL (pas du mineur)
Pool       → attend 720 blocs, puis envoie reward - fee au mineur gagnant
```

C'est la meme chose en PPLNS et en SOLO. La seule difference est **a qui** la pool envoie les ERG apres maturation.

### Identification du gagnant

Quand un bloc est trouve, la pool sait **immediatement** qui l'a trouve grace a la session TCP :

```typescript
if (result.meetsNetworkTarget) {
    // session.address = adresse Ergo du mineur gagnant
    // session.worker = nom du worker
    console.log("BLOC TROUVE par " + session.address + "." + session.worker);
}
```

Chaque mineur a sa propre connexion TCP persistante avec la pool. L'adresse et le worker sont enregistres lors du `mining.authorize`.

## Exemple concret : PPLNS vs SOLO

### Scenario

```
Hashrate reseau : 30 TH/s
Pool hashrate   : 2 GH/s (PPLNS) + 500 MH/s (SOLO)
Temps moyen entre blocs reseau : ~2 minutes
Reward par bloc : 3 ERG
```

### En PPLNS (2 GH/s pool)

```
Part du reseau    = 2 000 GH/s / 30 000 GH/s = 6.67%
Blocs par jour    = 720 * 6.67% = ~48 blocs/jour
Reward pool/jour  = 48 * 3 ERG = ~144 ERG/jour

Mineur avec 200 MH/s (10% de la pool) :
→ Gain/jour = 144 * 10% * 0.99 (fee) = ~14.3 ERG/jour
→ Paiement regulier, petits montants
```

### En SOLO (mineur de 200 MH/s)

```
Part du reseau       = 200 MH/s / 30 000 GH/s = 0.00067%
Blocs par jour       = 720 * 0.00067% = ~0.0048
Temps moyen un bloc  = 1 / 0.0048 = ~208 jours

Quand il trouve un bloc :
→ Gain = 3 ERG * 0.985 (fee 1.5%) = 2.955 ERG
→ Mais en moyenne, il attend ~208 jours entre chaque bloc !
```

### Comparaison gains

| Periode | PPLNS (200 MH/s) | SOLO (200 MH/s) |
|---------|-------------------|------------------|
| 1 jour | ~14.3 ERG | 0 ERG (probablement) |
| 1 semaine | ~100 ERG | 0 ERG (probablement) |
| 1 mois | ~429 ERG | Peut-etre 1 bloc (2.955 ERG) ou 0 |
| 6 mois | ~2 574 ERG | Peut-etre 1 bloc (2.955 ERG) |
| 1 an | ~5 220 ERG | ~1.75 blocs = ~5.17 ERG |

**Conclusion** : sur le long terme, les gains sont quasi-identiques (en theorie). La difference est la **variance** : PPLNS = revenus reguliers, SOLO = longue attente puis gros gain.

## A qui s'adresse le SOLO ?

### SOLO est fait pour :
- **Gros mineurs** (plusieurs GH/s) qui trouvent des blocs regulierement
- **Joueurs** qui aiment le "tout ou rien"
- **Mineurs patients** qui preferent garder 100% du reward

### SOLO n'est PAS fait pour :
- **Petits mineurs** (quelques centaines de MH/s) → attente trop longue
- **Mineurs qui veulent un revenu regulier** → PPLNS est mieux
- **Debutants** → PPLNS est plus simple a comprendre

### Seuil pratique

En general, le SOLO devient interessant quand le mineur peut esperer trouver un bloc **au moins une fois par semaine** :

```
Temps moyen < 7 jours
→ hashrate_mineur > hashrate_reseau / (720 * 7)
→ hashrate_mineur > 30 TH/s / 5040
→ hashrate_mineur > ~6 GH/s (pour Ergo actuellement)
```

Avec moins de 6 GH/s, le SOLO est possible mais **tres aleatoire**.

## Stats Frontend - Quoi afficher

### Dashboard pool (Home)

| Stat | PPLNS | SOLO | Action |
|------|-------|------|--------|
| Hashrate pool | Affiche | Affiche separe (SOLO pool hashrate) | Separer par mode |
| Miners Online | Affiche | Affiche separe | Separer par mode |
| Effort pool | % effort collectif | Masquer (pas pertinent en SOLO) | Masquer en SOLO |
| Blocs trouves | Blocs de la pool | Blocs SOLO (avec info finder) | Filtrer par mode |
| Last Block | Dernier bloc pool | Dernier bloc SOLO | Separer par mode |

### Page mineur (MinerPage)

| Stat | PPLNS | SOLO | Action |
|------|-------|------|--------|
| Hashrate (15m, 1h, 24h) | Affiche | Affiche | Identique |
| Workers (liste, status) | Affiche | Affiche | Identique |
| Shares valides/invalides | Affiche | Affiche | Identique |
| Effort mineur | Non affiche | `% effort personnel` | NOUVEAU en SOLO |
| Temps estime | Non affiche | "~X jours par bloc" | NOUVEAU en SOLO |
| PPLNS Window | Affiche | Masquer (pas de window) | Masquer en SOLO |
| Blocs trouves | Blocs pool | Mes blocs (finder = moi) | Filtrer par mineur |
| Paiements | Frequents, petits | Rares, gros | Identique en affichage |
| Reward par bloc | Part proportionnelle | Reward complet - fee | Renommer |

### Formules des nouvelles metriques SOLO

**Effort par mineur** :
```
effort_mineur = SUM(shares du mineur depuis dernier bloc du mineur) / network_difficulty * 100
```

**Temps estime pour trouver un bloc** :
```
temps_estime = (hashrate_reseau / hashrate_mineur) * temps_moyen_bloc_reseau
             = (30 TH/s / 200 MH/s) * 2 minutes
             = 150 000 * 2 min
             = ~208 jours
```

## Implementation technique (resume)

### Modifications backend necessaires

| Fichier | Modification |
|---------|-------------|
| `server.ts` | Attribut `miningMode` par session (selon le port de connexion) |
| `server.ts` (handleSubmit) | Si bloc → appel `distributePPLNS()` ou `distributeSolo()` selon mode |
| **`solo.ts`** (nouveau) | Credite 100% du reward (- fee) au `session.address` |
| `config.ts` | Nouveau port SOLO (ex: 3417), fee SOLO (1.5%) |
| DB migrations | Colonne `mining_mode` sur tables `shares`, `blocks`, `balances` |
| `api.ts` | Endpoints filtres par mode, nouvelles metriques SOLO |

### Modifications frontend necessaires

| Fichier | Modification |
|---------|-------------|
| `LandingPage.tsx` | Onglet SOLO → route `/coin/ergo-solo` quand actif |
| `Home.tsx` | Variante SOLO : effort mineur, temps estime, blocs du mineur |
| `MinerPage.tsx` | Effort personnel, temps estime, blocs du mineur |
| `coins.ts` | Mode `solo` passe a `active: true` avec route |
| `api.ts` (frontend) | Parametres `?mode=solo` sur les appels API |

### Ce qui NE change PAS

- Protocole Stratum (meme code)
- `autolykos2.ts` (validation identique)
- Noeud Ergo et sa configuration
- Mecanisme de confirmation (720 blocs)
- Systeme de paiement (balance → tx)

## Voir aussi

- [PPLNS](pplns.md) - Fonctionnement du mode PPLNS actuel
- [Les Shares](shares.md) - Comprendre shareDiff et validation
- [Protocole Stratum](stratum-protocol.md) - Identique en PPLNS et SOLO
- [Blocs et Rewards](../blockchain/blocks-rewards.md) - Confirmations et maturation
