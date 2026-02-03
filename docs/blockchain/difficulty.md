# Difficulte et Hashrate

## Les deux types de difficulte

### 1. Difficulte Reseau (Network Difficulty)

C'est la difficulte pour trouver un **bloc valide**. Elle est ajustee automatiquement par le reseau Ergo toutes les 1024 blocs pour maintenir un temps moyen de ~2 minutes par bloc.

**Actuellement** : ~300-320 T (trillions)

Si plus de mineurs rejoignent le reseau → difficulte augmente
Si des mineurs partent → difficulte diminue

### 2. Difficulte Share (Share Difficulty / Vardiff)

C'est la difficulte pour trouver une **share valide** sur la pool. Elle est beaucoup plus faible que la difficulte reseau pour que les mineurs puissent prouver leur travail regulierement.

**Typiquement** : 10,000 - 50,000 (variable par mineur)

## Comment ca marche ?

### Le target b

Dans Ergo :
```
b = q / difficulty
```

- **bNetwork** = q / networkDifficulty (target pour un bloc)
- **bShare** = bNetwork × vardiff (target pour une share)

Plus `b` est grand → plus c'est facile de trouver un hash valide.

### Exemple concret

```
networkDifficulty = 318 T
vardiff = 10,000

bNetwork = q / 318T  (tres petit = tres dur)
bShare = bNetwork × 10,000  (plus grand = plus facile)
```

Le mineur mine contre `bShare`. S'il trouve un hash < bShare → share valide.
S'il trouve un hash < bNetwork → BLOC TROUVE ! 🎉

## Le Vardiff (Variable Difficulty)

### Pourquoi le vardiff ?

Sans vardiff, tous les mineurs auraient la meme difficulte :
- Un **gros rig** (5 GH/s) trouverait des shares toutes les 2 secondes → spam
- Un **petit rig** (100 MH/s) trouverait des shares toutes les 2 minutes → peu de preuves de travail

Le vardiff ajuste la difficulte **par mineur** pour que chacun trouve une share environ toutes les **15 secondes**.

### Comment ca fonctionne ?

1. La pool observe le temps entre les shares d'un mineur
2. Si les shares arrivent trop vite → augmenter le vardiff (target plus dur)
3. Si les shares arrivent trop lentement → diminuer le vardiff (target plus facile)

### Formule

```
nouveauVardiff = ancienVardiff × (tempsObserve / tempsCible)
```

Exemple :
- tempsCible = 15 secondes
- tempsObserve = 30 secondes (shares trop lentes)
- nouveauVardiff = 10,000 × (30/15) = 20,000 (target plus facile)

## Calcul du Hashrate

### Formule

```
hashrate = SUM(shareDiff) / temps
```

Ou `shareDiff = networkDifficulty / vardiff`

### Exemple

Un mineur avec vardiff=10,000 et networkDiff=318T :
```
shareDiff = 318T / 10,000 = 31.8 milliards

S'il trouve 4 shares en 60 secondes :
hashrate = (4 × 31.8G) / 60 = 2.12 GH/s
```

### Pourquoi ca marche ?

Chaque share prouve un certain "travail" proportionnel a `shareDiff`. Un mineur puissant avec un vardiff bas a des shares plus "lourdes" qu'un petit mineur avec un vardiff haut. Au final, le hashrate calcule reflette la vraie puissance de calcul.

## Low / Medium / High Difficulty Ports

Certaines pools proposent plusieurs ports avec des difficultes fixes :

| Port | Difficulte | Pour qui |
|------|------------|----------|
| 3416 | Low (auto) | Petits rigs < 500 MH/s |
| 3417 | Medium | Rigs moyens 500 MH/s - 2 GH/s |
| 3418 | High | Gros rigs > 2 GH/s |

**KORVEX** utilise un seul port (3416) avec **vardiff automatique** qui s'adapte a chaque mineur.

## Voir aussi

- [Comprendre Ergo](ergo-basics.md) - Les bases d'Ergo
- [Les Shares](../mining/shares.md) - Shares et validation
- [Protocole Stratum](../mining/stratum-protocol.md) - Comment le vardiff est communique
