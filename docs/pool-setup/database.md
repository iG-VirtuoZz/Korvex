# Structure de la Base de Donnees

## Vue d'ensemble

KORVEX utilise **PostgreSQL** pour stocker toutes les donnees de la pool.

```
korvex_pool
├── shares              # Toutes les shares soumises
├── blocks              # Blocs trouves par la pool
├── block_rewards       # Distribution PPLNS par bloc
├── balances            # Soldes des mineurs
├── miners              # Stats par mineur
├── payments            # Historique des paiements
├── pool_hashrate_1m    # Agregation hashrate pool
├── miner_hashrate_1m   # Agregation hashrate par mineur
├── worker_hashrate_1m  # Agregation hashrate par worker
└── network_snapshots   # Historique difficulte reseau
```

## Tables principales

### shares

Chaque share soumise par un mineur.

```sql
CREATE TABLE shares (
  id            SERIAL PRIMARY KEY,
  address       VARCHAR(64) NOT NULL,      -- Adresse du mineur
  worker        VARCHAR(64) DEFAULT 'default',
  share_diff    BIGINT NOT NULL,           -- Poids de la share (networkDiff/vardiff)
  block_diff    BIGINT NOT NULL,           -- Difficulte reseau au moment
  block_height  INTEGER NOT NULL,          -- Hauteur du bloc
  is_valid      BOOLEAN NOT NULL,          -- Share acceptee ou rejetee
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Index pour les requetes frequentes
CREATE INDEX idx_shares_address_created ON shares(address, created_at);
CREATE INDEX idx_shares_created ON shares(created_at);
```

**Retention** : 30 jours (purgees automatiquement)

### blocks

Blocs trouves par la pool.

```sql
CREATE TABLE blocks (
  id               SERIAL PRIMARY KEY,
  height           INTEGER NOT NULL UNIQUE,
  hash             VARCHAR(128),            -- BlockId reel du noeud
  reward           BIGINT DEFAULT 0,        -- (legacy, utiliser reward_nano)
  reward_nano      BIGINT,                  -- Reward en nanoERG
  difficulty       BIGINT NOT NULL,
  miner_address    VARCHAR(64) NOT NULL,
  worker           VARCHAR(64),
  status           VARCHAR(20) DEFAULT 'pending',  -- pending/confirmed/orphan
  is_orphan        BOOLEAN DEFAULT FALSE,
  effort_percent   DOUBLE PRECISION,        -- Effort pour trouver ce bloc
  pplns_shares     INTEGER,                 -- Nombre de shares dans le PPLNS
  pplns_diff_sum   BIGINT,                  -- Somme des shareDiff PPLNS
  reward_distributed BOOLEAN DEFAULT FALSE, -- PPLNS calcule ?
  confirmed_at     TIMESTAMP,               -- Quand confirme
  created_at       TIMESTAMP DEFAULT NOW()
);
```

### block_rewards

Distribution PPLNS pour chaque bloc.

```sql
CREATE TABLE block_rewards (
  id           SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  address      VARCHAR(64) NOT NULL,       -- Mineur (ou POOL_ADDRESS pour fee)
  amount       BIGINT NOT NULL,            -- Reward en nanoERG
  share_count  INTEGER,                    -- Nombre de shares du mineur
  share_diff_sum BIGINT,                   -- Somme shareDiff du mineur
  created_at   TIMESTAMP DEFAULT NOW(),

  UNIQUE(block_height, address)
);
```

### balances

Solde de chaque mineur (rewards confirmes).

```sql
CREATE TABLE balances (
  address    VARCHAR(64) PRIMARY KEY,
  balance    BIGINT DEFAULT 0,             -- En nanoERG
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### miners

Statistiques agregees par mineur.

```sql
CREATE TABLE miners (
  address       VARCHAR(64) PRIMARY KEY,
  total_shares  BIGINT DEFAULT 0,
  valid_shares  BIGINT DEFAULT 0,
  invalid_shares BIGINT DEFAULT 0,
  total_paid    BIGINT DEFAULT 0,          -- Total paye en nanoERG
  last_share    TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);
```

### payments

Historique des paiements.

```sql
CREATE TABLE payments (
  id           SERIAL PRIMARY KEY,
  address      VARCHAR(64) NOT NULL,
  amount_nano  BIGINT NOT NULL,            -- Montant en nanoERG
  tx_hash      VARCHAR(128),               -- Hash de la transaction
  status       VARCHAR(20) DEFAULT 'pending',  -- pending/sent/failed/unknown
  error_msg    TEXT,
  sent_at      TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);
```

## Tables d'agregation

### pool_hashrate_1m

Hashrate pool agrege par minute.

```sql
CREATE TABLE pool_hashrate_1m (
  ts_minute   TIMESTAMP PRIMARY KEY,
  diff_sum    BIGINT NOT NULL,             -- Somme shareDiff sur la minute
  share_count INTEGER NOT NULL
);
```

**Calcul hashrate** : `hashrate = diff_sum / 60`

### miner_hashrate_1m / worker_hashrate_1m

Meme structure, avec `address` et optionnellement `worker`.

### network_snapshots

Historique de la difficulte reseau.

```sql
CREATE TABLE network_snapshots (
  ts         TIMESTAMP PRIMARY KEY,
  difficulty BIGINT NOT NULL,
  height     INTEGER
);
```

## Relations

```
blocks 1──────N block_rewards
   │
   └── block_height

miners 1──────N shares
   │              │
   └── address    └── address

miners 1──────N payments
   │              │
   └── address    └── address

miners 1──────1 balances
   │              │
   └── address    └── address
```

## Requetes utiles

### Hashrate pool (30 min)

```sql
SELECT SUM(diff_sum) / 1800 AS hashrate
FROM pool_hashrate_1m
WHERE ts_minute > NOW() - INTERVAL '30 minutes';
```

### Balance d'un mineur

```sql
SELECT balance FROM balances WHERE address = $1;
```

### Shares PPLNS pour un bloc

```sql
SELECT address, SUM(share_diff) as total_diff
FROM shares
WHERE created_at > (SELECT created_at FROM blocks WHERE height = $1 - 1)
  AND created_at <= (SELECT created_at FROM blocks WHERE height = $1)
GROUP BY address;
```

## Maintenance

Les taches automatiques (`maintenance.ts`) :
- **Toutes les 60s** : agreger hashrate (pool, miner, worker)
- **Toutes les 5min** : snapshot difficulte reseau
- **Toutes les 10min** : confirmer blocs + payer mineurs
- **Toutes les heures** : purger shares > 30 jours
- **Toutes les heures** : purger agregats > 90 jours

## Voir aussi

- [Architecture Pool](architecture.md)
- [PPLNS](../mining/pplns.md)
- [Gestion Wallet](../wallet/wallet-management.md)
