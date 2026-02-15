# Blocs, Rewards et Orphans

## C'est quoi un bloc ?

Un bloc est un "paquet" de transactions qui est ajoute a la blockchain. Il contient :

- **Header** : hash du bloc precedent, timestamp, difficulte, nonce
- **Transactions** : les transfers d'ERG a valider
- **Coinbase** : la transaction speciale qui cree les nouveaux ERG (la reward)

## La Reward de Bloc

### Composition

La reward d'un bloc Ergo comprend :

1. **Emission reward** : nouveaux ERG crees (actuellement ~6 ERG)
2. **Transaction fees** : frais payes par les utilisateurs

### Evolution de l'emission

L'emission diminue avec le temps selon un calendrier fixe :

| Periode | Hauteur blocs | Reward par bloc |
|---------|---------------|-----------------|
| Debut | 0 - 525,600 | 75 ERG |
| Actuel | ~1,700,000 | ~6 ERG |
| Futur | > 2,000,000 | ~3 ERG |
| Final | > 2,500,000 | 0 ERG (fees uniquement) |

### Comment recuperer la reward actuelle ?

Via l'API du noeud Ergo :
```
GET /emission/at/{height}
```

## Confirmations

### Pourquoi attendre des confirmations ?

Quand un bloc est trouve, il n'est pas immediatement "sur" :
- Un autre mineur peut avoir trouve un bloc au meme moment
- Le reseau peut reorganiser la chaine (reorg)
- Il faut attendre que d'autres blocs soient construits par-dessus

### Combien de confirmations ?

| Confirmations | Temps (~) | Securite |
|---------------|-----------|----------|
| 1 | 2 min | Tres risque |
| 10 | 20 min | Risque |
| 30 | 1 heure | Acceptable pour petits montants |
| 720 | 24 heures | Standard pour les pools |

**KORVEX** attend **720 confirmations** (~24h) avant de crediter les balances. C'est le standard de l'industrie.

## Les Orphans (Blocs Orphelins)

### C'est quoi un orphan ?

Un bloc orphelin est un bloc qui a ete valide mais qui n'est plus dans la chaine principale. Ca arrive quand :

1. Deux mineurs trouvent un bloc quasi-simultanement
2. Le reseau "choisit" une des deux branches
3. L'autre bloc devient orphelin et sa reward est perdue

### Detection des orphans

La pool doit verifier que ses blocs sont toujours sur la chaine principale :

```
1. Recuperer les block IDs a la hauteur du bloc
2. Comparer avec le blockId qu'on a enregistre
3. Si notre blockId n'est plus present → orphan !
```

### Taux d'orphan typique

- Pools bien connectees : < 1%
- Pools mal connectees : 2-5%
- Network congestionne : peut augmenter

## Cycle de vie d'un bloc trouve

```
1. BLOC TROUVE !
   ↓
2. Soumis au noeud (submitSolution)
   ↓
3. Enregistre en status "pending"
   ↓
4. Distribution PPLNS calculee (pas encore creditee)
   ↓
5. Attente confirmations (720 blocs = ~24h)
   ↓
6. Verification orphan
   ↓
   ├── Si orphan → status "orphan", pas de credit
   │
   └── Si confirme → status "confirmed", balances creditees
```

## Voir aussi

- [Comprendre Ergo](ergo-basics.md) - Les bases
- [PPLNS](../mining/pplns.md) - Distribution des rewards
- [Gestion Wallet](../wallet/wallet-management.md) - Paiements
