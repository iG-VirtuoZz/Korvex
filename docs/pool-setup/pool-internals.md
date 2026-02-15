# Fonctionnement Interne de la Pool KORVEX

> Guide visuel en tableaux pour comprendre comment la pool fonctionne, avec historique des changements.

---

## 1. Le Parcours d'une Share (de A a Z)

Ce qui se passe quand un GPU trouve un hash et l'envoie a la pool :

| Etape | Qui | Quoi | Resultat |
|-------|-----|------|----------|
| 1 | **GPU** | Calcule des milliards de hash/seconde | Trouve un hash < bShare |
| 2 | **Mineur** (lolMiner/TRM) | Envoie `mining.submit` avec le nonce | Message TCP vers la pool |
| 3 | **Pool (Stratum)** | Recalcule le hash Autolykos2 | Verifie que le hash est correct |
| 4 | **Pool (Stratum)** | Compare hash vs `bShare` | Share valide ou invalide |
| 5 | **Pool (Stratum)** | Compare hash vs `bNetwork` | Si < bNetwork = BLOC ! |
| 6 | **Pool (DB)** | Enregistre la share dans PostgreSQL | `shareDiff` = travail prouve |
| 7 | **Pool (Vardiff)** | Met a jour le buffer de timestamps | Servira au prochain retarget |

### Si un BLOC est trouve (etape 5)

| Etape | Quoi | Detail |
|-------|------|--------|
| 5a | Soumettre au noeud Ergo | La solution est envoyee au noeud |
| 5b | Alerte Discord | Webhook envoie un message |
| 5c | Calcul effort | `effort = totalShareDiff / networkDiff * 100%` |
| 5d | Attente blockId | Jusqu'a 5 tentatives, 2s d'intervalle |
| 5e | Enregistrer le bloc | Dans la table `blocks` de PostgreSQL |
| 5f | Distribution PPLNS | Repartir la reward entre les mineurs |

---

## 2. Comment on Trouve un Bloc (l'analogie du de)

### Le principe : un de a 1 milliard de faces

Imagine un de a **1 milliard de faces**. Tes GPU lancent ce de des millions de fois par seconde.

| Qui decide | Regle | Difficulte |
|------------|-------|------------|
| Le **reseau Ergo** | "Pour un bloc, il faut faire **moins de 5**" | Quasi impossible (1 chance sur 200 millions) |
| La **pool** | "Pour une share, il faut faire **moins de 50 000**" | Difficile mais faisable (1 chance sur 20 000) |

### Ce qui se passe a chaque lancer

```
GPU lance le de des millions de fois par seconde...

  Resultat : 8 392 571    → Trop haut, on jette (le GPU ne dit rien)
  Resultat : 2 458 103    → Trop haut, on jette
  Resultat : 38 421       → C'est < 50 000 !
     Pool : "Share valide !"
     Pool : "C'est < 5 ? NON → c'est pas un bloc, on continue"

  ... des millions de lancers plus tard ...

  Resultat : 3            → C'est < 50 000 ET < 5 !
     Pool : "Share valide !"
     Pool : "C'est < 5 ? OUI → BLOC TROUVE !!!"
     Pool : → soumet la solution au reseau Ergo
```

> **Point cle** : une share et un bloc c'est le MEME calcul. La seule difference c'est le seuil. Un bloc est simplement une share qui a eu BEAUCOUP de chance.

### Visuellement : ou tombe le hash ?

```
0          bNetwork                    bShare                              MAX
|              |                         |                                  |
|██████████████|█████████████████████████|                                  |
|              |                         |                                  |
|  hash ici ?  |    hash ici ?           |       hash ici ?                 |
|  = BLOC !!!  |    = Share valide       |       = Rate (on jette)          |
|  (ultra rare)|    (toutes les ~15s)    |       (la grande majorite)       |
```

Plus `bShare` est grand (= vardiff eleve), plus la zone "share valide" est large, plus c'est facile de trouver une share.
Mais `bNetwork` ne bouge pas (c'est le reseau qui le decide), donc trouver un bloc reste aussi dur.

### La formule magique

```
bShare = bNetwork x vardiff
```

| Target | Valeur (exemple) | C'est quoi |
|--------|------------------|------------|
| `bNetwork` | 1 000 000 | Le seuil du reseau (fixe, tres petit = tres dur) |
| `vardiff` | 50 000 | Le multiplicateur choisi par la pool pour ce worker |
| `bShare` | 1 000 000 x 50 000 = 50 milliards | Le seuil du worker (beaucoup plus grand = plus facile) |

Un hash a **50 000x plus de chances** d'etre < bShare que d'etre < bNetwork.
Donc pour ~50 000 shares valides, **1 seule** aurait aussi ete un bloc (statistiquement).

### Avec nos vrais chiffres

| Rig | Vardiff | Shares pour 1 bloc (theorie) | Shares/min | Temps estime (ce rig seul) |
|-----|---------|------------------------------|------------|---------------------------|
| Rig_4070x8 | ~53 000 | ~53 000 shares | ~4 | ~9.2 jours |
| Rig_4070Super (NVIDIA) | ~43 000 | ~43 000 shares | ~4 | ~7.5 jours |
| Rig_4070Super (AMD) | ~135 000 | ~135 000 shares | ~4 | ~23.4 jours |
| Rig_Test | ~12 000 | ~12 000 shares | ~4 | ~2.1 jours |
| **Tous ensemble** | - | - | **~16** | **~1.5 jours** |

> Chaque rig lance le de de son cote. Plus on a de GPU, plus on lance le de souvent, plus on a de chances de tomber sur un nombre < bNetwork.

### Pourquoi c'est completement aleatoire ?

| Idee recue | Realite |
|------------|---------|
| "On se rapproche du bloc" | NON. Chaque hash est independant, il n'y a pas de "progression" |
| "Si ca fait longtemps qu'on mine, le prochain bloc est bientot" | NON. C'est le biais du joueur (gambler's fallacy) |
| "Le hashrate garantit un bloc dans X jours" | NON. C'est une moyenne statistique, pas une garantie |

C'est **exactement** comme la loterie :
- Acheter plus de tickets (= plus de hashrate) augmente tes **chances par tirage**
- Mais tu peux gagner au 1er ticket ou au 100 000eme
- Avoir perdu 99 999 fois ne rend pas le 100 000eme ticket plus chanceux

---

## 3. Securite : Pourquoi on ne Peut Pas Tricher

### L'idee : "Si je baisse mon vardiff, j'ai plus de shares, donc plus de rewards ?"

NON. Voici pourquoi :

### Le poids de chaque share change !

```
shareDiff = networkDiff / vardiff
```

| Scenario | Vardiff | Shares/sec | shareDiff (poids) | Travail total/sec |
|----------|---------|------------|-------------------|-------------------|
| Normal | 50 000 | 0.07 | 6.2 G | **0.43 G** |
| "Triche" | 1 | 3 500 | 0.000124 G | **0.43 G** |

Le travail total par seconde est **identique** ! Avec un vardiff bas, tu as plein de shares mais chacune "pese" quasiment rien. C'est comme couper une pizza en 1000 parts au lieu de 8 : tu as plus de parts, mais la quantite totale de pizza n'a pas change.

### Et pour trouver un bloc ?

Le bloc est trouve quand le hash < `bNetwork`. Ca ne depend **PAS** du vardiff.

```
bShare = bNetwork x vardiff
```

| Vardiff | bShare | Plus facile de trouver une share ? | Plus facile de trouver un bloc ? |
|---------|--------|------------------------------------|---------------------------------|
| 50 000 | bNetwork x 50 000 | Oui (1 share / 15s) | **NON** - bNetwork n'a pas change |
| 1 | bNetwork x 1 | Non (tres rare) | **NON** - bNetwork n'a pas change |
| 500 000 | bNetwork x 500 000 | Oui (beaucoup) | **NON** - bNetwork n'a pas change |

Le vardiff decide juste **a quelle frequence** le mineur montre son travail a la pool. Mais le GPU lance exactement le meme nombre de des par seconde quel que soit le vardiff. Et le bloc est trouve quand le de tombe sur < 5, que tu aies demande a voir les resultats < 50 000 ou < 50 milliards.

### La seule facon d'augmenter ses chances ?

**Avoir plus de hashrate** (= lancer le de plus souvent). Il n'y a aucun raccourci mathematique. C'est pour ca que le minage consomme autant d'electricite - c'est de la force brute pure.

### Toutes les "triches" imaginables et pourquoi elles echouent

| "Triche" imaginee | Ce qui se passe | Protection |
|-------------------|-----------------|------------|
| Baisser le vardiff | Les shares pesent moins, travail total identique | `shareDiff = netDiff / vardiff` |
| Envoyer des fausses shares | La pool recalcule le hash Autolykos2 | → `Low difficulty share` → rejete |
| Envoyer le meme hash 2 fois | Le nonce est deja dans le Set | → `Share duplique` → rejete |
| Modifier le nonce | Le hash recalcule ne sera pas < bShare | → `Low difficulty share` → rejete |
| Pretendre avoir trouve un bloc | Le noeud Ergo recalcule tout | → Bloc rejete par le reseau |
| Flood de shares invalides | Compteur par IP, ban apres 50 | → `Trop de shares invalides, banni` |

> Chaque couche verifie la precedente. Le GPU prouve son travail par les maths, la pool verifie les maths, le noeud Ergo re-verifie les maths. C'est ca la beaute de la **preuve de travail** (Proof of Work) : on ne peut pas mentir aux mathematiques.

---

## 4. Le Vardiff - Comment la Pool Ajuste la Difficulte

### Principe

Le vardiff (variable difficulty) ajuste la difficulte de chaque worker pour qu'il envoie **1 share toutes les ~15 secondes**.

| Worker | Hashrate | Vardiff ideal | Shares/min | Pourquoi |
|--------|----------|---------------|------------|----------|
| 1x RTX 4070 | ~126 MH/s | ~40 000 | ~4 | Standard |
| 8x RTX 4070 | ~1010 MH/s | ~315 000 | ~4 | Vardiff 8x plus haut |
| 1x Vega 56 | ~132 MH/s | ~42 000 | ~4 | Meme principe |
| Ferme 10 GH/s | 10 000 MH/s | ~3 100 000 | ~4 | Clampe a maxDiff |
| Petit GPU 50 MH/s | 50 MH/s | ~16 000 | ~4 | Vardiff bas |

### Les 3 Mecanismes du Vardiff

```
  Connexion                1ere share              Toutes les 90s             Toutes les 30s
      |                        |                        |                        |
      v                        v                        v                        v
  [BOOTSTRAP]            [BOOTSTRAP]              [RETARGET]              [IDLE SWEEP]
  markAuthorized()       Estimation rapide        Ajustement fin          Detection silence
                         vardiff * (temps/15)     Max +25%/-20%           Si idle > 30s
                                                  Zone morte 30%          vardiff + 50%
```

| Mecanisme | Quand | Objectif | Vitesse |
|-----------|-------|----------|---------|
| **Bootstrap** | 1ere share d'un nouveau worker | Estimation rapide du vardiff optimal | Instantane (1 share) |
| **Retarget** | Toutes les 90s, si 8+ shares | Ajustement fin vers la target 15s | Progressif (max +25%/-20%) |
| **Idle Sweep** | Toutes les 30s | Debloquer un worker silencieux | Moderee (+50% par cycle) |

---

## 5. Parametres Vardiff - Historique des Versions

### v1 → v2 (06 fevrier 2026)

**Probleme** : Le worker AMD (Vega 56, 132 MH/s) oscillait violemment entre 3 182 et 98 130 de vardiff (10 changements/heure). Cela causait des pics de hashrate irrealistes (329 MH/s affiche au lieu de 132 MH/s reel).

#### Avant (v1) : Config initiale

| Parametre | Valeur v1 | Effet |
|-----------|-----------|-------|
| `minDiff` | 5 000 | Max ~200 MH/s par worker |
| `maxDiff` | 100 000 | Min ~500 MH/s par worker |
| `MAX_DIFF_CHANGE_RATIO` | 1.5 | Sauts de +50%/-33% par cycle |
| `variancePercent` | 25% | Retarget si avgTime < 11.25s ou > 18.75s |
| Min shares retarget | 6 | Moyenne sur peu de donnees |
| Idle sweep | Aucun | Workers bloques non detectes |
| Bootstrap | Aucun | 6+ cycles pour converger |

**Exemple d'oscillation AMD avec v1 :**

| Temps | Vardiff | Shares/min | Hashrate affiche | Probleme |
|-------|---------|------------|------------------|----------|
| 0:00 | 20 000 | 8.5 | 56 MH/s | Trop facile, shares trop rapides |
| 1:30 | 30 000 | 5.7 | 84 MH/s | Encore trop rapide |
| 3:00 | 45 000 | 3.8 | 126 MH/s | Presque bon... |
| 4:30 | 67 500 | 2.5 | 189 MH/s | Trop dur ! |
| 6:00 | 98 130 | 1.7 | **329 MH/s** | Beaucoup trop dur |
| 7:30 | 65 420 | 2.6 | 183 MH/s | Redescend... |
| 9:00 | 43 613 | 3.9 | 122 MH/s | Presque bon... |
| 10:30 | 30 000 | 5.7 | 84 MH/s | Trop facile... |
| ... | ... | ... | ... | Cycle sans fin |

> Probleme cle : les sauts de +50% sont trop grands, le vardiff depasse la cible puis revient, puis redepasse...

#### Apres (v2) : Anti-oscillation + Idle Sweep + Bootstrap

| Parametre | Valeur v1 | Valeur v2 | Pourquoi le changement |
|-----------|-----------|-----------|------------------------|
| `minDiff` | 5 000 | **100** | Supporter des fermes jusqu'a ~200 GH/s |
| `maxDiff` | 100 000 | **500 000** | Supporter des petits GPU (~40 MH/s) |
| `MAX_DIFF_CHANGE_RATIO` | 1.5 | **1.25** | Sauts reduits a +25%/-20% (anti-oscillation) |
| `variancePercent` | 25% | **30%** | Retarget seulement si avgTime < 10.5s ou > 19.5s |
| Min shares retarget | 6 | **8** | Moyenne plus fiable avant d'ajuster |
| Idle sweep | Aucun | **30s / +50%** | Detecte et debloque les workers silencieux |
| Bootstrap | Aucun | **1ere share** | Estimation rapide du vardiff optimal |

**Exemple de convergence AMD avec v2 :**

| Temps | Vardiff | Shares/min | Hashrate affiche | Commentaire |
|-------|---------|------------|------------------|-------------|
| 0:00 | 20 000 | - | - | Connexion, bootstrap actif |
| 0:42 | 56 000 | - | - | Bootstrap: 1ere share en 42s → `20000 * 42/15` |
| 2:12 | 70 000 | 3.2 | 147 MH/s | Retarget +25% (shares un peu lentes) |
| 3:42 | 70 000 | 3.8 | 132 MH/s | Zone morte, pas de changement |
| 5:12 | 70 000 | 4.1 | 132 MH/s | Stable ! |

> Le vardiff se stabilise en ~2 cycles au lieu d'osciller indefiniment.

---

## 6. Comment une Share est Pesee (shareDiff)

### Formule

```
shareDiff = networkDifficulty / vardiff
```

Plus le vardiff est eleve, plus la share est "legere" (car le mineur mine a une target plus facile).

### Exemple avec notre pool (networkDiff = 312 TH)

| Worker | Vardiff | shareDiff | Freq shares | Travail/min | Hashrate estime |
|--------|---------|-----------|-------------|-------------|-----------------|
| Rig_4070x8 | 52 767 | 5.9 G | ~4/min | 23.6 G/min | ~1 010 MH/s |
| NVIDIA (Rig_4070Super) | 43 110 | 7.2 G | ~4/min | 28.9 G/min | ~448 MH/s |
| AMD (Vega 56) | 135 395 | 2.3 G | ~4/min | 9.2 G/min | ~132 MH/s |
| Rig_Test | 12 309 | 25.4 G | ~4/min | 101.5 G/min | ~571 MH/s |

> **Observation** : Meme si les shareDiff sont tres differentes, le travail total par minute est proportionnel au hashrate reel. C'est la magie du vardiff !

### Pourquoi les shareDiff sont inverses du hashrate ?

| Plus le GPU est puissant... | ... plus le vardiff est eleve | ... plus chaque share est "legere" | ... mais il en envoie la meme quantite |
|---|---|---|---|
| Rig_4070x8 (1010 MH/s) | vardiff 52 767 | shareDiff 5.9 G | ~4/min |
| Vega 56 (132 MH/s) | vardiff 135 395 | shareDiff 2.3 G | ~4/min |

C'est contre-intuitif mais logique : un GPU puissant a un vardiff plus dur donc ses shares "comptent moins" individuellement, mais le **volume de travail total** reste proportionnel a sa puissance.

---

## 7. Le Bootstrap - Demarrage Rapide

### Sans bootstrap (v1) : Convergence lente

| Cycle | Temps | Vardiff | Shares | Action |
|-------|-------|---------|--------|--------|
| 0 | 0:00 | 20 000 | 0 | Connexion |
| 1 | 1:30 | 20 000 | 3 | Pas assez de shares (< 6) |
| 2 | 3:00 | 20 000 | 5 | Toujours pas assez |
| 3 | 4:30 | 30 000 | 8 | Premier retarget +50% |
| 4 | 6:00 | 45 000 | 8 | Retarget +50% |
| 5 | 7:30 | 67 500 | 8 | Retarget +50% |
| 6 | 9:00 | 67 500 | 7 | Zone morte, presque bon |
| **Total** | **~9 min** | | | **Convergence apres 6 cycles** |

### Avec bootstrap (v2) : Convergence immediate

| Cycle | Temps | Vardiff | Shares | Action |
|-------|-------|---------|--------|--------|
| 0 | 0:00 | 20 000 | 0 | Connexion, `markAuthorized()` |
| - | 0:42 | 56 000 | 1 | **Bootstrap !** `20000 * 42/15 = 56000` |
| 1 | 2:12 | 70 000 | 8 | Retarget +25% (fine-tuning) |
| 2 | 3:42 | 70 000 | 8 | Zone morte, stable |
| **Total** | **~2 min** | | | **Convergence apres 1 bootstrap + 1 retarget** |

---

## 8. L'Idle Sweep - Debloquer les Workers Silencieux

### Scenario type : Worker AMD qui recoit un vardiff trop eleve

| Temps | Evenement | Vardiff | Idle ? |
|-------|-----------|---------|--------|
| 0:00 | Share OK | 135 000 | Non |
| 0:30 | Aucune share depuis 30s | 135 000 | **Oui** → Idle Sweep |
| 0:30 | Idle Sweep: vardiff +50% | 202 500 | Reset |
| 0:45 | Share OK (diff plus facile) | 202 500 | Non |
| 1:30 | Retarget normal | 180 000 | Non |

> Sans idle sweep, le worker serait reste bloque jusqu'au prochain retarget (90s). L'idle sweep reagit en 30s.

### Progression d'un worker totalement bloque

Si un worker ne trouve aucune share (vardiff beaucoup trop bas = trop dur) :

| Temps | Vardiff | Idle Sweep # | Commentaire |
|-------|---------|-------------|-------------|
| 0:00 | 10 000 | - | Vardiff trop bas, target trop dure |
| 0:30 | 15 000 | #1 | +50%, toujours trop dur |
| 1:00 | 22 500 | #2 | +50%, toujours trop dur |
| 1:30 | 33 750 | #3 | +50%, commence a trouver |
| 1:32 | 33 750 | - | 1ere share ! Retarget prendra le relais |
| 3:00 | 42 000 | - | Retarget normal, stable |

> L'idle sweep augmente le vardiff de 50% toutes les 30s jusqu'a ce que le worker retrouve des shares.

---

## 9. Le PPLNS - Repartition des Rewards

### Principe

PPLNS = **Pay Per Last N Shares**. Quand un bloc est trouve, la reward est repartie entre les mineurs qui ont contribue aux `N` dernieres shares.

| Parametre | Valeur | Signification |
|-----------|--------|---------------|
| PPLNS factor | 2 | N = 2x la difficulte reseau |
| Fee pool | 1% | La pool garde 1% de chaque bloc |
| Reward mineur | 99% | Les mineurs se partagent 99% |

### Exemple de distribution

Bloc trouve ! Reward = 6 ERG (fee 1% = 0.06 ERG pour la pool)

| Mineur | % des shares dans la fenetre PPLNS | Reward |
|--------|-------------------------------------|--------|
| Rig_4070x8 | 47% | 2.79 ERG |
| Rig_Test | 26% | 1.55 ERG |
| NVIDIA | 21% | 1.25 ERG |
| AMD | 6% | 0.35 ERG |
| **Total** | **100%** | **5.94 ERG** |

---

## 10. Cycle de Vie d'un Bloc

| Etape | Statut | Delai | Detail |
|-------|--------|-------|--------|
| 1 | **Trouve** | 0 | Hash < bNetwork, solution soumise au noeud |
| 2 | **Pending** | 0 - 24h | En attente de 720 confirmations |
| 3 | **Confirme** | ~24h | 720 blocs suivants mines par le reseau |
| 4 | **Paye** | ~24h + quelques min | Paiements envoyes aux mineurs |
| - | **Orphelin** | Variable | Si un autre pool a trouve le meme bloc en premier |

### Confirmations requises

| Reseau | Confirmations | Temps moyen | Pourquoi |
|--------|--------------|-------------|----------|
| Ergo | 720 blocs | ~24 heures | Protection contre les reorganisations de chaine |
| Bitcoin | 100 blocs | ~16 heures | Meme principe |
| Ethereum (PoS) | N/A | N/A | Plus de minage |

---

## 11. Le Hashrate - D'ou Vient le Chiffre Affiche

### Pipeline de calcul

```
GPU calcule → Share soumise → shareDiff enregistre → API aggrege → Frontend affiche
```

| Etape | Formule | Exemple |
|-------|---------|---------|
| 1. Share soumise | `shareDiff = netDiff / vardiff` | 312T / 52767 = 5.9G |
| 2. Somme sur 10 min | `SUM(shareDiff)` sur 10 min | 150G |
| 3. Hashrate brut | `SUM / temps` | 150G / 600s = 250 MH/s |
| 4. Facteur correctif | `brut * 1.08` | 250 * 1.08 = 270 MH/s |
| 5. Affichage | Arrondi | **270 MH/s** |

### Pourquoi un facteur correctif de 1.08 ?

| Concept | Explication |
|---------|-------------|
| **Dataset Autolykos2** | Les GPU doivent regenerer une table de 2.5 GB a chaque epoque (~1024 blocs) |
| **Temps perdu** | Pendant la generation (1-4s), le GPU ne mine pas |
| **Consequence** | Le hashrate mesure par les shares est ~8% inferieur au hashrate reel |
| **Solution** | Multiplier par 1.08 pour compenser |
| **Reference** | MiningCore (pool Ergo open-source) utilise 1.15, mais calibre a 1.08 pour nous |

### Verification : Pool vs HiveOS

| Source | Hashrate | Ecart |
|--------|----------|-------|
| HiveOS (reference, 08/02) | 2.16 GH/s (969 + 711 + 479) | - |
| Pool avec facteur 1.08 | 2.05 - 2.13 GH/s | 2-5% |
| Pool SANS facteur | 1.90 - 2.01 GH/s | 8-15% |

> Le facteur 1.08 ramene l'ecart a seulement 2-5% vs HiveOS. C'est normal qu'il reste un petit ecart car le hashrate calcule depuis les shares est une estimation statistique.

---

## 12. Nos Rigs - Configuration Actuelle

#### v2 (08 fevrier 2026) - Config actuelle

| Rig | GPU | Logiciel | Hashrate | Conso |
|-----|-----|----------|----------|-------|
| Rig_4070x8 | 8x RTX 4070 | lolMiner 1.98a | ~969 MH/s | ~563W |
| Rig_4070Super (NVIDIA) | RTX 3080 + RTX 3070 + RTX 3060 Ti + RTX 4070 | lolMiner 1.98a | ~447 MH/s | - |
| Rig_4070Super (AMD) | 2x Vega 56 | TeamRedMiner 0.10.21 | ~264 MH/s | - |
| Rig_4070Super (total) | 6 GPU | lolMiner + TeamRedMiner | **~711 MH/s** | **~527W** |
| Rig_Test | RX 580 (mix) | TeamRedMiner 0.10.21 | ~479 MH/s | ~513W |
| **Total** | | | **~2.16 GH/s** | **~1 603W** |

#### v1 (06 fevrier 2026) - Ancienne config

| Rig | GPU | Logiciel | Hashrate | Conso |
|-----|-----|----------|----------|-------|
| Rig_4070x8 | 8x RTX 4070 | lolMiner 1.98a | ~1 010 MH/s | ~950W |
| Rig_4070Super (NVIDIA) | RTX 3080 + GTX 1080 + GTX 1070 + GTX 1080 Ti x2 + RTX 3070 + RTX 4070 | lolMiner 1.98a | ~448 MH/s | ~450W |
| Rig_4070Super (AMD) | 1x Vega 56 | TeamRedMiner 0.10.21 | ~132 MH/s | ~200W |
| Rig_Test | Mix AMD | TeamRedMiner 0.10.21 | ~571 MH/s | ??? |
| **Total** | **21 GPU** | | **~2.16 GH/s** | **~1 616W** |

> **Changements v1 → v2** : 2eme Vega 56 ajoutee au Rig_4070Super (132 → 264 MH/s AMD). Quelques GPU changes sur le Rig_4070Super NVIDIA. Rig_Test = RX 580.

### Compatibilite logiciels de minage

| Logiciel | GPU supportes | Taux de succes | Recommande ? |
|----------|---------------|---------------|--------------|
| lolMiner | NVIDIA + AMD | ~95% | Oui (NVIDIA) |
| TeamRedMiner | AMD uniquement | ~99.9% | Oui (AMD) |
| SRBMiner | AMD uniquement | ~95% | Non (rejets plus eleves que TRM) |

---

## 13. Temps Moyen pour Trouver un Bloc

### Formule

```
Part du reseau = Hashrate pool / Hashrate reseau
Blocs par jour reseau = 720 (1 bloc toutes les 2 min)
Blocs par jour pool = 720 * Part du reseau
Temps moyen = 1 / Blocs par jour pool
```

### Avec nos 2.16 GH/s (08 fevrier 2026)

| Donnee | Valeur |
|--------|--------|
| Hashrate pool | 2.16 GH/s |
| Hashrate reseau | ~2.36 TH/s |
| Part du reseau | 2.16 / 2 360 = **0.0915%** |
| Blocs par jour pool | 720 * 0.000915 = **0.659** |
| **Temps moyen** | **1 / 0.659 = ~1.5 jours** |

> C'est une **moyenne statistique**. On peut trouver un bloc dans 2h ou dans 1 semaine. C'est comme la loterie : la probabilite est fixe mais le resultat est aleatoire.
>
> **Note** : Le hashrate reseau varie en permanence. Ce calcul est un snapshot au 08/02/2026. Le frontend de la pool affiche cette estimation en temps reel via l'API.

---

## Voir aussi

- [Les Shares](../mining/shares.md) - Theorie detaillee sur les shares
- [Difficulte & Hashrate](../blockchain/difficulty.md) - Calculs de difficulte
- [PPLNS](../mining/pplns.md) - Systeme de repartition des rewards
- [Architecture](architecture.md) - Vue d'ensemble technique
- [Protocole Stratum](../mining/stratum-protocol.md) - Communication mineur ↔ pool
