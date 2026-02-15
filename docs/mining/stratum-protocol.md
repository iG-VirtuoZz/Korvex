# Protocole Stratum pour Ergo

## C'est quoi Stratum ?

Stratum est le **protocole de communication** entre les mineurs et la pool. C'est un protocole JSON-RPC sur TCP.

```
[Mineur GPU] ←──TCP/JSON──→ [Pool Stratum Server] ←──HTTP──→ [Noeud Ergo]
```

## Les messages Stratum

### 1. mining.subscribe

Le mineur s'annonce a la pool.

**Mineur → Pool :**
```json
{
  "id": 1,
  "method": "mining.subscribe",
  "params": ["lolMiner/1.98"]
}
```

**Pool → Mineur :**
```json
{
  "id": 1,
  "result": [
    [["mining.set_difficulty", "subscription_id"], ["mining.notify", "subscription_id"]],
    "extraNonce1",  // 4 caracteres hex (ex: "0a3f")
    6               // taille extraNonce2 en bytes
  ],
  "error": null
}
```

### 2. mining.authorize

Le mineur s'authentifie avec son adresse et nom de worker.

**Mineur → Pool :**
```json
{
  "id": 2,
  "method": "mining.authorize",
  "params": ["9iQUvjNrpuhq...K2ZmMQb.Rig_4070x8", ""]
}
```

**Pool → Mineur :**
```json
{
  "id": 2,
  "result": true,
  "error": null
}
```

### 3. mining.set_difficulty

La pool informe le mineur de sa difficulte.

**Pool → Mineur :**
```json
{
  "id": null,
  "method": "mining.set_difficulty",
  "params": [1]
}
```

> **Note ERGO** : Les mineurs Ergo (lolMiner, Rigel, SRBMiner) **ignorent** ce message ! Ils utilisent directement le `b` de `mining.notify`.

### 4. mining.notify

La pool envoie un nouveau job a miner.

**Pool → Mineur :**
```json
{
  "id": null,
  "method": "mining.notify",
  "params": [
    "1a",                    // [0] jobId (hex)
    1713851,                 // [1] hauteur du bloc
    "a1b2c3d4...",          // [2] msg (header a hasher)
    "",                      // [3] (unused)
    "",                      // [4] (unused)
    "00000002",              // [5] version
    "3591847562...",         // [6] b (TARGET!) ← Le mineur utilise CA
    "",                      // [7] (unused)
    false                    // [8] clean_jobs
  ]
}
```

**IMPORTANT** : `params[6]` contient le **target b**. C'est LA valeur que le mineur utilise pour savoir si son hash est valide.

### 5. mining.submit

Le mineur soumet une share.

**Mineur → Pool :**
```json
{
  "id": 3,
  "method": "mining.submit",
  "params": [
    "9iQUvjNrpuhq...Rig_4070x8",  // [0] worker
    "1a",                          // [1] jobId
    "a1b2c3d4e5f6"                // [2] extraNonce2 (12 chars hex)
  ]
}
```

**Pool → Mineur :**
```json
{
  "id": 3,
  "result": true,   // ou false si rejetee
  "error": null     // ou ["21", "Low difficulty share"]
}
```

## Le Nonce complet

```
nonce = extraNonce1 + extraNonce2
```

- **extraNonce1** (4 chars) : assigne par la pool, unique par session
- **extraNonce2** (12 chars) : choisi par le mineur

Exemple :
```
extraNonce1 = "0a3f"
extraNonce2 = "a1b2c3d4e5f6"
nonce complet = "0a3fa1b2c3d4e5f6" (16 chars = 8 bytes)
```

## Le modele multiplyDifficulty (Ergo)

Pour Ergo, la pool utilise le modele **multiplyDifficulty** :

```
bShare = bNetwork × vardiff
```

Ce `bShare` est envoye dans `mining.notify params[6]`.

### Pourquoi ?

Les mineurs Ergo ignorent `mining.set_difficulty` et utilisent directement `params[6]` comme target. Donc pour controler le vardiff, on doit **modifier le b** envoye.

### Exemple

```
networkDifficulty = 318 T
bNetwork = q / 318T = petit nombre

vardiff = 10,000
bShare = bNetwork × 10,000 = nombre 10,000x plus grand = target plus facile
```

## Sequence complete

```
1. Mineur se connecte (TCP)
   ↓
2. mining.subscribe → Pool repond avec extraNonce1
   ↓
3. mining.authorize → Pool verifie l'adresse
   ↓
4. mining.set_difficulty(1) → Mineur ignore (Ergo)
   ↓
5. mining.notify avec le job + b pre-multiplie
   ↓
6. Mineur mine...
   ↓
7. Mineur trouve hash < b → mining.submit
   ↓
8. Pool valide → result: true ou error
   ↓
9. Si vardiff change → nouveau mining.notify avec nouveau b
   ↓
10. Retour a 6.
```

## Voir aussi

- [Les Shares](shares.md) - Validation des shares
- [Difficulte & Hashrate](../blockchain/difficulty.md) - Le vardiff
- [Architecture Pool](../pool-setup/architecture.md) - Implementation serveur
