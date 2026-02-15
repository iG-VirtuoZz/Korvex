# Database Structure

## Overview

KORVEX uses **PostgreSQL** to store all pool data.

```
korvex_pool
+-- shares              # All submitted shares
+-- blocks              # Blocks found by the pool
+-- block_rewards       # PPLNS distribution per block
+-- balances            # Miner balances
+-- miners              # Per-miner stats
+-- payments            # Payment history
+-- pool_hashrate_1m    # Pool hashrate aggregation
+-- miner_hashrate_1m   # Per-miner hashrate aggregation
+-- worker_hashrate_1m  # Per-worker hashrate aggregation
+-- network_snapshots   # Network difficulty history
```

## Main Tables

### shares

Every share submitted by a miner.

```sql
CREATE TABLE shares (
  id            SERIAL PRIMARY KEY,
  address       VARCHAR(64) NOT NULL,      -- Miner address
  worker        VARCHAR(64) DEFAULT 'default',
  share_diff    BIGINT NOT NULL,           -- Share weight (networkDiff/vardiff)
  block_diff    BIGINT NOT NULL,           -- Network difficulty at the time
  block_height  INTEGER NOT NULL,          -- Block height
  is_valid      BOOLEAN NOT NULL,          -- Share accepted or rejected
  created_at    TIMESTAMP DEFAULT NOW()
);

-- Indexes for frequent queries
CREATE INDEX idx_shares_address_created ON shares(address, created_at);
CREATE INDEX idx_shares_created ON shares(created_at);
```

**Retention**: 30 days (automatically purged)

### blocks

Blocks found by the pool.

```sql
CREATE TABLE blocks (
  id               SERIAL PRIMARY KEY,
  height           INTEGER NOT NULL UNIQUE,
  hash             VARCHAR(128),            -- Actual blockId from the node
  reward           BIGINT DEFAULT 0,        -- (legacy, use reward_nano)
  reward_nano      BIGINT,                  -- Reward in nanoERG
  difficulty       BIGINT NOT NULL,
  miner_address    VARCHAR(64) NOT NULL,
  worker           VARCHAR(64),
  status           VARCHAR(20) DEFAULT 'pending',  -- pending/confirmed/orphan
  is_orphan        BOOLEAN DEFAULT FALSE,
  effort_percent   DOUBLE PRECISION,        -- Effort to find this block
  pplns_shares     INTEGER,                 -- Number of shares in the PPLNS window
  pplns_diff_sum   BIGINT,                  -- Sum of shareDiff in PPLNS window
  reward_distributed BOOLEAN DEFAULT FALSE, -- PPLNS calculated?
  confirmed_at     TIMESTAMP,               -- When confirmed
  created_at       TIMESTAMP DEFAULT NOW()
);
```

### block_rewards

PPLNS distribution for each block.

```sql
CREATE TABLE block_rewards (
  id           SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  address      VARCHAR(64) NOT NULL,       -- Miner (or POOL_ADDRESS for fee)
  amount       BIGINT NOT NULL,            -- Reward in nanoERG
  share_count  INTEGER,                    -- Number of miner's shares
  share_diff_sum BIGINT,                   -- Sum of miner's shareDiff
  created_at   TIMESTAMP DEFAULT NOW(),

  UNIQUE(block_height, address)
);
```

### balances

Each miner's balance (confirmed rewards).

```sql
CREATE TABLE balances (
  address    VARCHAR(64) PRIMARY KEY,
  balance    BIGINT DEFAULT 0,             -- In nanoERG
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### miners

Aggregated statistics per miner.

```sql
CREATE TABLE miners (
  address       VARCHAR(64) PRIMARY KEY,
  total_shares  BIGINT DEFAULT 0,
  valid_shares  BIGINT DEFAULT 0,
  invalid_shares BIGINT DEFAULT 0,
  total_paid    BIGINT DEFAULT 0,          -- Total paid in nanoERG
  last_share    TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);
```

### payments

Payment history.

```sql
CREATE TABLE payments (
  id           SERIAL PRIMARY KEY,
  address      VARCHAR(64) NOT NULL,
  amount_nano  BIGINT NOT NULL,            -- Amount in nanoERG
  tx_hash      VARCHAR(128),               -- Transaction hash
  status       VARCHAR(20) DEFAULT 'pending',  -- pending/sent/failed/unknown
  error_msg    TEXT,
  sent_at      TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);
```

## Aggregation Tables

### pool_hashrate_1m

Pool hashrate aggregated per minute.

```sql
CREATE TABLE pool_hashrate_1m (
  ts_minute   TIMESTAMP PRIMARY KEY,
  diff_sum    BIGINT NOT NULL,             -- Sum of shareDiff over the minute
  share_count INTEGER NOT NULL
);
```

**Hashrate calculation**: `hashrate = diff_sum / 60`

### miner_hashrate_1m / worker_hashrate_1m

Same structure, with `address` and optionally `worker`.

### network_snapshots

Network difficulty history.

```sql
CREATE TABLE network_snapshots (
  ts         TIMESTAMP PRIMARY KEY,
  difficulty BIGINT NOT NULL,
  height     INTEGER
);
```

## Relationships

```
blocks 1------N block_rewards
   |
   +-- block_height

miners 1------N shares
   |              |
   +-- address    +-- address

miners 1------N payments
   |              |
   +-- address    +-- address

miners 1------1 balances
   |              |
   +-- address    +-- address
```

## Useful Queries

### Pool Hashrate (30 min)

```sql
SELECT SUM(diff_sum) / 1800 AS hashrate
FROM pool_hashrate_1m
WHERE ts_minute > NOW() - INTERVAL '30 minutes';
```

### Miner Balance

```sql
SELECT balance FROM balances WHERE address = $1;
```

### PPLNS Shares for a Block

```sql
SELECT address, SUM(share_diff) as total_diff
FROM shares
WHERE created_at > (SELECT created_at FROM blocks WHERE height = $1 - 1)
  AND created_at <= (SELECT created_at FROM blocks WHERE height = $1)
GROUP BY address;
```

## Maintenance

Automatic tasks (`maintenance.ts`):
- **Every 60s**: aggregate hashrate (pool, miner, worker)
- **Every 5 min**: network difficulty snapshot
- **Every 10 min**: confirm blocks + pay miners
- **Every hour**: purge shares older than 30 days
- **Every hour**: purge aggregations older than 90 days

## See Also

- [Pool Architecture](architecture.md)
- [PPLNS](../mining/pplns.md)
- [Wallet Management](../wallet/wallet-management.md)
