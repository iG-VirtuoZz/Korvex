# PPLNS - Pay Per Last N Shares

## C'est quoi PPLNS ?

PPLNS est un systeme de **repartition des rewards** entre les mineurs d'une pool. Au lieu de payer chaque share individuellement, on regarde les N dernieres shares quand un bloc est trouve.

## Pourquoi PPLNS ?

### Le probleme du "pool hopping"

Avec un systeme simple (pay-per-share), des mineurs malins peuvent :
1. Rejoindre la pool quand elle est "chanceuse"
2. Partir quand elle est "malchanceuse"
3. Profiter sans prendre de risque

### La solution PPLNS

PPLNS recompense la **loyaute** :
- On regarde les shares sur une **fenetre** de temps/difficulte
- Les mineurs qui restent longtemps sont recompenses equitablement
- Les pool-hoppers perdent leurs shares quand ils partent

## Comment ca marche ?

### La fenetre PPLNS

```
fenetre = factor × networkDifficulty
```

- **factor** : parametre de la pool (KORVEX = 2)
- **networkDifficulty** : difficulte reseau actuelle (~318T)

Exemple :
```
fenetre = 2 × 318T = 636T de travail cumule
```

### Quand un bloc est trouve

1. La pool regarde en arriere dans les shares
2. Elle cumule les `shareDiff` jusqu'a atteindre la fenetre
3. Chaque mineur recoit une part proportionnelle a son travail

### Exemple concret

```
Bloc trouve ! Reward = 6 ERG
Fenetre PPLNS = 636T

Shares dans la fenetre :
- Mineur A : 400T de shareDiff (62.9%)
- Mineur B : 200T de shareDiff (31.4%)
- Mineur C :  36T de shareDiff (5.7%)

Distribution (apres fee 1%) :
- Pool fee : 0.06 ERG
- Mineur A : 5.94 × 62.9% = 3.74 ERG
- Mineur B : 5.94 × 31.4% = 1.87 ERG
- Mineur C : 5.94 × 5.7%  = 0.34 ERG
```

## Calcul base sur shareDiff

### Pourquoi shareDiff et pas le nombre de shares ?

Avec le **vardiff**, chaque share a une difficulte differente :
- Petit mineur (vardiff haut) → beaucoup de shares legeres
- Gros mineur (vardiff bas) → peu de shares lourdes

Si on comptait juste le nombre de shares, le petit mineur serait avantage !

### La formule juste

```
part_mineur = SUM(shareDiff_mineur) / SUM(shareDiff_total)
```

Chaque share est ponderee par son `shareDiff`. Ca reflete le vrai travail effectue.

## Le factor PPLNS

### Qu'est-ce que ca change ?

| Factor | Fenetre | Effet |
|--------|---------|-------|
| 0.5 | Petite | Plus de variance, moins de loyaute |
| 1 | Moyenne | Equilibre |
| 2 | Grande | Moins de variance, plus de loyaute |
| 4 | Tres grande | Tres lisse, tres loyal |

**KORVEX utilise factor = 2** : bon equilibre entre stabilite et reactivite.

### Illustration

```
Factor 0.5 : On regarde les 30 dernieres minutes de travail
Factor 2   : On regarde les 2 dernieres heures de travail
Factor 4   : On regarde les 4 dernieres heures de travail
```

## Timing des credits

### Etape 1 : Bloc trouve

La distribution PPLNS est **calculee** et stockee dans `block_rewards`.
Mais les balances ne sont **pas encore creditees** !

### Etape 2 : Confirmation

Apres **720 confirmations** (~24h), le bloc est confirme.
Les balances sont alors creditees depuis `block_rewards`.

### Pourquoi attendre ?

Si le bloc devient orphelin, on ne veut pas avoir credite des ERG qui n'existent pas !

## Visualisation sur le dashboard

Sur KORVEX, tu peux voir :
- **Pending balance** : rewards en attente de confirmation
- **Balance** : rewards confirmees, prets a etre payes
- **/api/blocks/:height/rewards** : detail de la distribution d'un bloc

## Voir aussi

- [SOLO Mining](solo-mining.md) - L'alternative "tout ou rien" au PPLNS
- [Les Shares](shares.md) - Comprendre shareDiff
- [Blocs et Rewards](../blockchain/blocks-rewards.md) - Confirmations
- [Gestion Wallet](../wallet/wallet-management.md) - Paiements
