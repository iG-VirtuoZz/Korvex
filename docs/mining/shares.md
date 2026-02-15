# Les Shares - Comprendre le Concept Fondamental

## C'est quoi une Share ?

Une share est une **preuve de travail** soumise par un mineur a la pool. Elle prouve que le mineur a bien effectue des calculs de minage.

### Analogie simple

Imagine que trouver un bloc, c'est comme trouver un ticket de loterie gagnant dans un tas de 1 milliard de tickets.

- **Bloc** = ticket gagnant (1 chance sur 1 milliard)
- **Share** = ticket qui finit par "00" (1 chance sur 100)

La pool demande aux mineurs de montrer tous les tickets qui finissent par "00". Ca prouve qu'ils cherchent bien, meme s'ils n'ont pas encore trouve le gagnant.

## Share vs Bloc

| | Share | Bloc |
|---|-------|------|
| **Difficulte** | Basse (vardiff) | Haute (network) |
| **Frequence** | ~15 secondes | ~2 minutes (reseau entier) |
| **Reward** | Aucune directe | 6 ERG |
| **Utilite** | Prouver le travail | Valider transactions |

### Le lien entre les deux

Chaque share est en fait une **tentative de bloc**. Si par chance le hash de la share est aussi inferieur au target reseau → c'est un bloc !

```
Si hash < bShare      → Share valide ✓
Si hash < bNetwork    → BLOC TROUVE ! 🎉
```

## Validation d'une Share

### Ce que la pool verifie

1. **Le mineur est autorise** (adresse valide)
2. **Le job existe** (pas un vieux job expire)
3. **Le nonce est unique** (pas de doublon)
4. **Le hash est valide** (Autolykos2 complet)
5. **Le hash < target** (difficulte respectee)

### Le processus Autolykos2

```python
def valider_share(msg, nonce, height, bShare, bNetwork):
    # 1. Calculer l'index i
    i = blake2b(msg + nonce) % N

    # 2. Generer la seed e
    e = blake2b(i + height + M)

    # 3. Calculer 32 index J
    J = [genIndex(e, k) for k in range(32)]

    # 4. Recuperer les elements r (table de 2.5 GB)
    r = [element(J[k]) for k in range(32)]

    # 5. Additionner pour obtenir f
    f = sum(r)

    # 6. Hash final
    fh = blake2b(f)

    # 7. Verifier les targets
    if fh < bShare:
        share_valide = True
        if fh < bNetwork:
            bloc_trouve = True

    return share_valide, bloc_trouve
```

## Types de Shares

### Share Valide ✓

Le hash est inferieur au target du mineur. La pool l'accepte et la compte pour le PPLNS.

### Share Invalide ✗

Plusieurs raisons possibles :

| Erreur | Cause | Solution |
|--------|-------|----------|
| "Low difficulty" | Hash > target | Le mineur utilise un mauvais b |
| "Job not found" | Job expire | Le mineur est en retard |
| "Duplicate share" | Nonce deja soumis | Bug mineur ou triche |
| "Invalid nonce" | Mauvais format | Bug mineur |

### Bloc Candidat 🎉

Le hash est inferieur au target reseau ! La pool soumet la solution au noeud Ergo.

## Le poids d'une Share (shareDiff)

Toutes les shares n'ont pas la meme "valeur". Une share a un **poids** proportionnel a sa difficulte :

```
shareDiff = networkDifficulty / vardiff
```

### Exemple

| Mineur | Vardiff | shareDiff | Interpretation |
|--------|---------|-----------|----------------|
| Petit rig | 30,000 | 10.6 G | Share "legere" |
| Gros rig | 5,000 | 63.6 G | Share "lourde" |

Le gros rig a des shares moins frequentes mais plus lourdes. Au final, le **travail total** est proportionnel au hashrate reel.

## Calcul du Hashrate depuis les Shares

```
hashrate = SUM(shareDiff) / temps
```

Exemple sur 5 minutes :
- Mineur A : 20 shares × 31.8G shareDiff = 636 G de travail
- hashrate = 636G / 300s = 2.12 GH/s

## Voir aussi

- [Difficulte & Hashrate](../blockchain/difficulty.md) - Vardiff et calculs
- [Protocole Stratum](stratum-protocol.md) - Comment les shares sont envoyees
- [PPLNS](pplns.md) - Comment les shares sont recompensees
