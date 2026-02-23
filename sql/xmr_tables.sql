-- ============================================
-- Tables Monero (XMR) pour Korvex Pool
-- Meme base PostgreSQL korvex_pool, prefixe xmr_
-- Unite : piconero (1 XMR = 10^12 piconero)
-- ============================================

-- Shares Monero
CREATE TABLE IF NOT EXISTS xmr_shares (
  id BIGSERIAL PRIMARY KEY,
  address VARCHAR(128) NOT NULL,
  worker VARCHAR(128) DEFAULT '',
  share_diff DOUBLE PRECISION NOT NULL,
  block_diff DOUBLE PRECISION NOT NULL,
  block_height BIGINT NOT NULL,
  is_valid BOOLEAN DEFAULT true,
  mining_mode VARCHAR(16) DEFAULT 'pplns',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xmr_shares_created ON xmr_shares(created_at);
CREATE INDEX IF NOT EXISTS idx_xmr_shares_address ON xmr_shares(address);
CREATE INDEX IF NOT EXISTS idx_xmr_shares_mode_valid ON xmr_shares(mining_mode, is_valid) WHERE is_valid = true;
-- Index PPLNS : ORDER BY id DESC avec filtre is_valid + share_diff > 0 + mining_mode
CREATE INDEX IF NOT EXISTS idx_xmr_shares_pplns ON xmr_shares(id DESC) WHERE is_valid = true AND share_diff > 0 AND mining_mode = 'pplns';
-- Index effort : SUM(share_diff/block_diff) apres created_at
CREATE INDEX IF NOT EXISTS idx_xmr_shares_effort ON xmr_shares(mining_mode, created_at) WHERE is_valid = true AND share_diff > 0;

-- Blocs trouves
CREATE TABLE IF NOT EXISTS xmr_blocks (
  height BIGINT PRIMARY KEY,
  hash VARCHAR(128),
  reward BIGINT DEFAULT 0,
  difficulty BIGINT,
  finder_address VARCHAR(128),
  finder_worker VARCHAR(128) DEFAULT '',
  effort_percent DOUBLE PRECISION,
  mining_mode VARCHAR(16) DEFAULT 'pplns',
  status VARCHAR(16) DEFAULT 'pending',
  is_orphan BOOLEAN DEFAULT false,
  reward_distributed BOOLEAN DEFAULT false,
  reward_pico BIGINT DEFAULT 0,
  pplns_shares INTEGER DEFAULT 0,
  pplns_diff_sum DOUBLE PRECISION DEFAULT 0,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Index blocs pending (confirmer)
CREATE INDEX IF NOT EXISTS idx_xmr_blocks_pending ON xmr_blocks(height ASC) WHERE reward_distributed = false AND is_orphan = false;
-- Index blocs par mode (API)
CREATE INDEX IF NOT EXISTS idx_xmr_blocks_mode ON xmr_blocks(mining_mode, height DESC);

-- Balances (piconero)
CREATE TABLE IF NOT EXISTS xmr_balances (
  address VARCHAR(128) PRIMARY KEY,
  amount BIGINT DEFAULT 0
);

-- Rewards par bloc
CREATE TABLE IF NOT EXISTS xmr_block_rewards (
  id SERIAL PRIMARY KEY,
  block_height BIGINT NOT NULL,
  address VARCHAR(128) NOT NULL,
  amount BIGINT NOT NULL,
  share_count INTEGER DEFAULT 0,
  share_diff_sum DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(block_height, address)
);

-- Paiements
CREATE TABLE IF NOT EXISTS xmr_payments (
  id SERIAL PRIMARY KEY,
  address VARCHAR(128) NOT NULL,
  amount DOUBLE PRECISION,
  amount_pico BIGINT,
  tx_hash VARCHAR(128),
  status VARCHAR(16) DEFAULT 'pending',
  error_msg TEXT,
  retry_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xmr_payments_status ON xmr_payments(status);
CREATE INDEX IF NOT EXISTS idx_xmr_payments_address ON xmr_payments(address);
CREATE INDEX IF NOT EXISTS idx_xmr_payments_created ON xmr_payments(created_at DESC);

-- Mineurs
CREATE TABLE IF NOT EXISTS xmr_miners (
  address VARCHAR(128) PRIMARY KEY,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  total_shares BIGINT DEFAULT 0,
  total_blocks INTEGER DEFAULT 0,
  total_paid DOUBLE PRECISION DEFAULT 0
);

-- Hashrate pool (buckets 1 minute)
CREATE TABLE IF NOT EXISTS xmr_pool_hashrate_1m (
  ts_minute TIMESTAMPTZ NOT NULL,
  mining_mode VARCHAR(16) NOT NULL,
  diff_sum DOUBLE PRECISION DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  PRIMARY KEY (ts_minute, mining_mode)
);

-- Hashrate mineur (buckets 1 minute)
CREATE TABLE IF NOT EXISTS xmr_miner_hashrate_1m (
  ts_minute TIMESTAMPTZ NOT NULL,
  address VARCHAR(128) NOT NULL,
  mining_mode VARCHAR(16) NOT NULL,
  diff_sum DOUBLE PRECISION DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  PRIMARY KEY (ts_minute, address, mining_mode)
);

-- Hashrate worker (buckets 1 minute)
CREATE TABLE IF NOT EXISTS xmr_worker_hashrate_1m (
  ts_minute TIMESTAMPTZ NOT NULL,
  address VARCHAR(128) NOT NULL,
  worker VARCHAR(128) NOT NULL,
  mining_mode VARCHAR(16) NOT NULL,
  diff_sum DOUBLE PRECISION DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  PRIMARY KEY (ts_minute, address, worker, mining_mode)
);

-- Network snapshots Monero
CREATE TABLE IF NOT EXISTS xmr_network_snapshots (
  id SERIAL PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT NOW(),
  difficulty BIGINT,
  height BIGINT
);
