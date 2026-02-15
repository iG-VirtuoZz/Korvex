# Comprendre Ergo et Autolykos2

## C'est quoi Ergo ?

Ergo est une blockchain Proof-of-Work (PoW) comme Bitcoin, mais avec des differences importantes :

- **Algorithme**: Autolykos2 (resistant aux ASICs, optimise pour GPUs)
- **Temps de bloc**: ~2 minutes (120 secondes)
- **Reward actuelle**: ~6 ERG par bloc (diminue avec le temps)
- **Supply max**: ~97.7 millions ERG

## Comment fonctionne le minage ?

### Le principe de base

1. Le **noeud Ergo** genere un "candidat de bloc" contenant les transactions a valider
2. Les **mineurs** cherchent un nombre (nonce) qui, combine au candidat, produit un hash valide
3. Le premier mineur a trouver un hash valide **gagne la reward** du bloc
4. Le bloc est ajoute a la blockchain, et on recommence

### L'algorithme Autolykos2

Autolykos2 est l'algorithme de minage specifique a Ergo. Il est concu pour :

- **Resister aux ASICs** : necessite beaucoup de memoire (~2.5 GB)
- **Etre efficace sur GPU** : optimise pour les cartes graphiques modernes
- **Etre verifiable rapidement** : un noeud peut verifier une solution sans refaire tout le calcul

#### Les etapes de validation d'une share

```
1. Combiner le message (msg) avec le nonce
2. Calculer un index i = blake2b(msg + nonce) mod N
3. Generer une seed e a partir de i
4. Calculer 32 index J a partir de e
5. Pour chaque J, recuperer un element r dans une table de ~2.5 GB
6. Additionner les 32 elements r pour obtenir f
7. Hasher f pour obtenir fh (le hash final)
8. Si fh < target → solution valide !
```

**36 appels blake2b256** sont necessaires pour valider une seule share. C'est ce qui rend Autolykos2 intensif en memoire.

## La constante q et le target b

Dans Ergo, la difficulte est representee par deux valeurs :

### q (constante)
```
q ≈ 2^256
```
C'est le nombre total de hashes possibles (l'espace de recherche complet).

### b (target)
```
b = q / networkDifficulty
```
C'est le **seuil** en dessous duquel un hash est valide. Plus `b` est grand, plus c'est facile de trouver un hash valide.

### Exemple concret

Si `networkDifficulty = 300 T` (300 trillions) :
```
b = 2^256 / 300,000,000,000,000
b ≈ 3.86 × 10^62
```

Un hash `fh` est valide si `fh < b`.

## Voir aussi

- [Difficulte & Hashrate](difficulty.md) - Comment fonctionne la difficulte
- [Les Shares](../mining/shares.md) - Shares vs blocs
- [Site officiel Ergo](https://ergoplatform.org)
- [Documentation Ergo](https://docs.ergoplatform.com)
