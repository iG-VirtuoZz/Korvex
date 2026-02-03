# Gestion du Wallet Pool

## Le Wallet Pool

Le wallet de la pool est un wallet Ergo gere par le **noeud Ergo**. C'est lui qui :
- Recoit les rewards des blocs trouves
- Envoie les paiements aux mineurs

**Adresse KORVEX** : `9h4UsBoiaFSJAyUSnEgvnjjq6XBptx8vXbc4KPiC8Q5pGuybtYN`

## Securite du Wallet

### Mot de passe

Le wallet est protege par un mot de passe stocke dans `.env` :
```
WALLET_PASS=ton_mot_de_passe_secret
```

**IMPORTANT** :
- Ne jamais committer le `.env` sur GitHub
- Utiliser `chmod 600 .env` pour restreindre les permissions
- Sauvegarder le mot de passe et la mnemonic en lieu sur

### Verrouillage

Le wallet est **verrouille par defaut**. Il est deverrouille uniquement pendant les paiements (~10 secondes max).

```
Etat normal : wallet verrouille (locked)
             ↓
Cycle paiement : unlock → envoyer paiements → lock
             ↓
Retour : wallet verrouille
```

Au demarrage de la pool, un `lockWallet()` est execute pour s'assurer que le wallet est verrouille (au cas ou un crash precedent l'aurait laisse ouvert).

## Cycle de Paiement

### Conditions

Un paiement est effectue quand :
1. Le mineur a une balance >= **1 ERG** (seuil minimum)
2. Il n'y a pas de paiements "unknown" en attente
3. Le wallet a assez de fonds

### Etapes

```
1. Verifier qu'il n'y a pas de paiements "unknown"
   ↓
2. Recuperer les mineurs avec balance >= 1 ERG
   ↓
3. Deverrouiller le wallet
   ↓
4. Pour chaque batch (max 20 mineurs) :
   a. Debiter les balances (transaction SQL)
   b. Creer les paiements en status "pending"
   c. Envoyer la transaction au noeud
   d. Si OK : status "sent" + txHash
      Si erreur : re-crediter balances + status "failed"
      Si timeout : status "unknown" (intervention manuelle)
   ↓
5. Verrouiller le wallet
```

### Status des paiements

| Status | Signification | Action |
|--------|---------------|--------|
| `pending` | Reserve, pas encore envoye | Attendre |
| `sent` | Transaction broadcastee | OK, rien a faire |
| `failed` | Erreur, balance re-creditee | Verifier les logs |
| `unknown` | Timeout, on ne sait pas | **Intervention manuelle** |

### Paiements "unknown"

Si un paiement est en status "unknown", **tous les paiements automatiques sont bloques** jusqu'a resolution manuelle.

Pourquoi ? On ne sait pas si la transaction a ete broadcastee ou non. Il faut verifier manuellement sur l'explorateur blockchain.

## Commandes Wallet

### Via l'API du noeud Ergo

**Deverrouiller** :
```bash
curl -X POST "http://127.0.0.1:9053/wallet/unlock" \
  -H "api_key: hello" \
  -H "Content-Type: application/json" \
  -d '{"pass": "mot_de_passe"}'
```

**Verrouiller** :
```bash
curl -X GET "http://127.0.0.1:9053/wallet/lock" \
  -H "api_key: hello"
```

**Voir le solde** :
```bash
curl "http://127.0.0.1:9053/wallet/balances" \
  -H "api_key: hello"
```

**Envoyer un paiement** :
```bash
curl -X POST "http://127.0.0.1:9053/wallet/payment/send" \
  -H "api_key: hello" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {"address": "9xxx...", "value": 1000000000}
    ],
    "fee": 1000000
  }'
```

## Creer/Restaurer un Wallet

### Nouveau wallet

```bash
curl -X POST "http://127.0.0.1:9053/wallet/init" \
  -H "api_key: hello" \
  -H "Content-Type: application/json" \
  -d '{"pass": "nouveau_mot_de_passe"}'
```

Reponse : la **mnemonic** (15 mots). **SAUVEGARDER ABSOLUMENT !**

### Restaurer un wallet

> **ATTENTION** : Ne fonctionne PAS si le noeud est en mode **pruning** !

```bash
curl -X POST "http://127.0.0.1:9053/wallet/restore" \
  -H "api_key: hello" \
  -H "Content-Type: application/json" \
  -d '{
    "pass": "mot_de_passe",
    "mnemonic": "mot1 mot2 mot3 ... mot15",
    "usePre1627KeyDerivation": false
  }'
```

## Frais de Transaction

Chaque paiement a des frais de **0.001 ERG** (1,000,000 nanoERG).

Ces frais sont payes par le wallet de la pool, pas par le mineur.

## Voir aussi

- [PPLNS](../mining/pplns.md) - Comment les rewards sont calculees
- [Blocs et Rewards](../blockchain/blocks-rewards.md) - Confirmations
- [Monitoring](../operations/monitoring.md) - Verifier les paiements
