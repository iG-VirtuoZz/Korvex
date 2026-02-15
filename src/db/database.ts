import { Pool, PoolClient } from "pg";
import { config } from "../config";

class Database {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      max: 20,
      idleTimeoutMillis: 30000,
    });
  }

  async query(text: string, params?: any[]) {
    return this.pool.query(text, params);
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async getPoolStats() {
    const activeMiners = await this.query(
      "SELECT COUNT(DISTINCT address) as count FROM shares WHERE created_at > NOW() - INTERVAL '24 hours'"
    );
    const totalShares = await this.query(
      "SELECT COUNT(*) as count FROM shares WHERE created_at > NOW() - INTERVAL '24 hours'"
    );
    const totalBlocks = await this.query("SELECT COUNT(*) as count FROM blocks");
    const lastBlock = await this.query("SELECT height FROM blocks ORDER BY height DESC LIMIT 1");

    return {
      activeMiners: parseInt(activeMiners.rows[0].count) || 0,
      totalShares: parseInt(totalShares.rows[0].count) || 0,
      totalBlocks: parseInt(totalBlocks.rows[0].count) || 0,
      lastBlockHeight: lastBlock.rows[0]?.height || 0,
    };
  }

  async recordShare(address: string, worker: string, shareDiff: number, blockDiff: number, blockHeight: number, isValid: boolean, miningMode: string = 'pplns') {
    await this.query(
      "INSERT INTO shares (address, worker, share_diff, block_diff, block_height, is_valid, mining_mode) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [address, worker, shareDiff, blockDiff, blockHeight, isValid, miningMode]
    );
    await this.query(
      "INSERT INTO miners (address) VALUES ($1) ON CONFLICT (address) DO UPDATE SET last_seen=NOW(), total_shares=miners.total_shares+1",
      [address]
    );
  }

  async recordBlock(height: number, hash: string, reward: number, difficulty: number, finderAddress: string, finderWorker: string, effortPercent: number | null = null, miningMode: string = 'pplns') {
    await this.query(
      "INSERT INTO blocks (height,hash,reward,difficulty,finder_address,finder_worker,effort_percent,mining_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (height) DO NOTHING",
      [height, hash, reward, difficulty, finderAddress, finderWorker, effortPercent, miningMode]
    );
    await this.query(
      "UPDATE miners SET total_blocks=total_blocks+1 WHERE address=$1",
      [finderAddress]
    );
  }

  // ============================================
  // Effort / Luck
  // ============================================

  /**
   * Smoothed effort: each share is weighted by the network difficulty AT THE TIME it was submitted.
   * Returns the number of accumulated "block fractions" (1.0 = 100% effort).
   * Advantage: effort rises steadily, no jumps when network diff changes.
   */
  async getEffortSinceLastBlock(miningMode: string = 'pplns'): Promise<number> {
    const lastBlock = await this.query(
      "SELECT created_at FROM blocks WHERE mining_mode = $1 ORDER BY height DESC LIMIT 1",
      [miningMode]
    );

    let effort: number;
    if (lastBlock.rows.length > 0) {
      const result = await this.query(
        "SELECT COALESCE(SUM(share_diff::double precision / NULLIF(block_diff::double precision, 0)), 0) as total FROM shares WHERE is_valid = true AND share_diff > 0 AND mining_mode = $1 AND created_at > $2",
        [miningMode, lastBlock.rows[0].created_at]
      );
      effort = parseFloat(result.rows[0].total) || 0;
    } else {
      const result = await this.query(
        "SELECT COALESCE(SUM(share_diff::double precision / NULLIF(block_diff::double precision, 0)), 0) as total FROM shares WHERE is_valid = true AND share_diff > 0 AND mining_mode = $1",
        [miningMode]
      );
      effort = parseFloat(result.rows[0].total) || 0;
    }

    return effort;
  }

  async getEffortForMinerSolo(address: string): Promise<number> {
    const lastBlock = await this.query(
      "SELECT created_at FROM blocks WHERE finder_address = $1 AND mining_mode = 'solo' ORDER BY height DESC LIMIT 1",
      [address]
    );
    const since = lastBlock.rows.length > 0 ? lastBlock.rows[0].created_at : null;
    const whereTime = since ? "AND created_at > $3" : "";
    const params = since
      ? [address, 'solo', since]
      : [address, 'solo'];
    const result = await this.query(
      "SELECT COALESCE(SUM(share_diff::double precision / NULLIF(block_diff::double precision, 0)), 0) as total FROM shares WHERE is_valid = true AND share_diff > 0 AND address = $1 AND mining_mode = $2 " + whereTime,
      params
    );
    return parseFloat(result.rows[0].total) || 0;
  }

  async getAverageEffort(limit: number = 20): Promise<number | null> {
    const result = await this.query(
      "SELECT AVG(effort_percent) as avg_effort FROM (SELECT effort_percent FROM blocks WHERE effort_percent IS NOT NULL ORDER BY height DESC LIMIT $1) sub",
      [limit]
    );
    const avg = parseFloat(result.rows[0].avg_effort);
    return isNaN(avg) ? null : avg;
  }

  // ============================================
  // Phase 2 - PPLNS
  // ============================================

  async getSharesForPPLNS(windowDiff: number): Promise<Array<{ address: string; share_diff: number }>> {
    const batchSize = 1000;
    let offset = 0;
    let cumulDiff = 0;
    const result: Array<{ address: string; share_diff: number }> = [];

    while (cumulDiff < windowDiff) {
      const batch = await this.query(
        `SELECT address, share_diff FROM shares
         WHERE is_valid = true AND share_diff > 0 AND mining_mode = 'pplns'
         ORDER BY id DESC
         LIMIT $1 OFFSET $2`,
        [batchSize, offset]
      );

      if (batch.rows.length === 0) break;

      for (const row of batch.rows) {
        const diff = parseFloat(row.share_diff);
        result.push({ address: row.address, share_diff: diff });
        cumulDiff += diff;
        if (cumulDiff >= windowDiff) break;
      }

      offset += batchSize;
    }

    return result;
  }

  async insertBlockRewardsAndUpdateBlock(
    blockHeight: number,
    rewards: Array<{ address: string; shareCount: number; shareDiffSum: number; amountNano: bigint }>,
    rewardNano: bigint,
    pplnsShares: number,
    pplnsDiffSum: number
  ): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query("BEGIN");

      for (const r of rewards) {
        await client.query(
          `INSERT INTO block_rewards (block_height, address, amount, share_count, share_diff_sum)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (block_height, address) DO NOTHING`,
          [blockHeight, r.address, r.amountNano.toString(), r.shareCount, r.shareDiffSum]
        );
      }

      await client.query(
        `UPDATE blocks
         SET reward_nano = $1, pplns_shares = $2, pplns_diff_sum = $3, reward_distributed = false
         WHERE height = $4`,
        [rewardNano.toString(), pplnsShares, pplnsDiffSum, blockHeight]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getBalance(address: string): Promise<bigint> {
    const result = await this.query(
      "SELECT amount FROM balances WHERE address = $1",
      [address]
    );
    if (result.rows.length === 0) return BigInt(0);
    return BigInt(result.rows[0].amount);
  }

  async getBlockRewards(blockHeight: number): Promise<Array<{
    address: string;
    amount: string;
    share_count: number;
    share_diff_sum: number;
    created_at: string;
  }>> {
    const result = await this.query(
      `SELECT address, amount, share_count, share_diff_sum, created_at
       FROM block_rewards
       WHERE block_height = $1
       ORDER BY amount DESC`,
      [blockHeight]
    );
    return result.rows;
  }

  // ============================================
  // Phase 3 - Confirmations + Payments
  // ============================================

  async getPendingBlocks(): Promise<Array<{ height: number; hash: string; reward_nano: string; created_at: string }>> {
    const result = await this.query(
      `SELECT height, hash, reward_nano, created_at FROM blocks
       WHERE reward_distributed = false
         AND is_orphan = false
         AND reward_nano > 0
       ORDER BY height ASC`
    );
    return result.rows;
  }

  async markBlockOrphan(blockHeight: number): Promise<void> {
    await this.query(
      `UPDATE blocks SET is_orphan = true, status = 'orphan' WHERE height = $1`,
      [blockHeight]
    );
  }

  async confirmBlockAndCreditBalances(blockHeight: number): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query("BEGIN");

      const blockCheck = await client.query(
        "SELECT reward_distributed FROM blocks WHERE height = $1 FOR UPDATE",
        [blockHeight]
      );
      if (blockCheck.rows.length === 0 || blockCheck.rows[0].reward_distributed === true) {
        await client.query("ROLLBACK");
        return;
      }

      const rewards = await client.query(
        "SELECT address, amount FROM block_rewards WHERE block_height = $1",
        [blockHeight]
      );

      for (const row of rewards.rows) {
        await client.query(
          `INSERT INTO balances (address, amount) VALUES ($1, $2)
           ON CONFLICT (address) DO UPDATE SET amount = balances.amount + $2`,
          [row.address, row.amount]
        );
      }

      await client.query(
        `UPDATE blocks
         SET reward_distributed = true, confirmed_at = NOW(), status = 'confirmed'
         WHERE height = $1`,
        [blockHeight]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getPayableBalances(minPayoutNano: bigint, excludeAddress?: string): Promise<Array<{ address: string; amount: bigint }>> {
    // Exclude the pool address to avoid sending a payment to itself
    const query = excludeAddress
      ? "SELECT address, amount FROM balances WHERE amount >= $1 AND address != $2 ORDER BY amount DESC"
      : "SELECT address, amount FROM balances WHERE amount >= $1 ORDER BY amount DESC";
    const params = excludeAddress
      ? [minPayoutNano.toString(), excludeAddress]
      : [minPayoutNano.toString()];
    const result = await this.query(query, params);
    return result.rows.map((row: any) => ({
      address: row.address,
      amount: BigInt(row.amount),
    }));
  }

  // ============================================
  // Safe payments — prepare + finalize
  // ============================================

  // Phase 1: reserves funds and creates payments as 'pending' (1 atomic transaction)
  // Returns created payments with their address and amount (to build the tx payload)
  async prepareBatchPayments(
    entries: Array<{ address: string; amount: bigint }>
  ): Promise<Array<{ id: number; address: string; amount: bigint }>> {
    const client = await this.getClient();
    try {
      await client.query("BEGIN");

      const prepared: Array<{ id: number; address: string; amount: bigint }> = [];

      for (const entry of entries) {
        // Debit balance with lock (implicit FOR UPDATE via WHERE amount >= ...)
        const debit = await client.query(
          `UPDATE balances SET amount = amount - $1
           WHERE address = $2 AND amount >= $1
           RETURNING amount`,
          [entry.amount.toString(), entry.address]
        );

        if (debit.rows.length === 0) {
          // Insufficient balance for this address, skip (doesn't block the batch)
          console.error("[DB] prepareBatch: solde insuffisant pour " + entry.address + ", skip");
          continue;
        }

        // Create the payment with 'pending' status
        const payment = await client.query(
          `INSERT INTO payments (address, amount, amount_nano, status, created_at)
           VALUES ($1, $2, $3, 'pending', NOW())
           RETURNING id`,
          [entry.address, Number(entry.amount) / 1e9, entry.amount.toString()]
        );

        prepared.push({
          id: payment.rows[0].id,
          address: entry.address,
          amount: entry.amount,
        });
      }

      if (prepared.length === 0) {
        await client.query("ROLLBACK");
        return [];
      }

      await client.query("COMMIT");
      return prepared;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Phase 2a: mark payments as 'sent' with the txHash
  async finalizeBatchPayments(paymentIds: number[], txHash: string): Promise<void> {
    if (paymentIds.length === 0) return;
    const client = await this.getClient();
    try {
      await client.query("BEGIN");

      for (const id of paymentIds) {
        await client.query(
          `UPDATE payments SET status = 'sent', tx_hash = $1, sent_at = NOW() WHERE id = $2 AND status = 'pending'`,
          [txHash, id]
        );
      }

      // Update total_paid in miners
      const payments = await client.query(
        `SELECT address, amount_nano FROM payments WHERE id = ANY($1)`,
        [paymentIds]
      );
      for (const row of payments.rows) {
        await client.query(
          `UPDATE miners SET total_paid = total_paid + $1 WHERE address = $2`,
          [Number(BigInt(row.amount_nano)) / 1e9, row.address]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Phase 2b: mark payments as 'unknown' (send failed/timeout)
  // Transactional to avoid "phantom" payments stuck in pending status if crash mid-way
  async markBatchPaymentsUnknown(paymentIds: number[], errorMsg: string): Promise<void> {
    if (paymentIds.length === 0) return;
    const client = await this.getClient();
    try {
      await client.query("BEGIN");
      for (const id of paymentIds) {
        await client.query(
          `UPDATE payments SET status = 'unknown', error_msg = $1 WHERE id = $2 AND status = 'pending'`,
          [errorMsg, id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Check if there are unresolved unknown payments (blocks automatic payouts)
  async hasUnresolvedPayments(): Promise<boolean> {
    const result = await this.query(
      "SELECT COUNT(*) as count FROM payments WHERE status = 'unknown'"
    );
    return parseInt(result.rows[0].count) > 0;
  }

  // Legacy function kept for API compatibility (getRecentPayments, etc.)
  async debitBalanceAndRecordPayment(
    address: string,
    amountNano: bigint,
    txHash: string
  ): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query("BEGIN");

      const debit = await client.query(
        `UPDATE balances SET amount = amount - $1
         WHERE address = $2 AND amount >= $1
         RETURNING amount`,
        [amountNano.toString(), address]
      );

      if (debit.rows.length === 0) {
        await client.query("ROLLBACK");
        console.error(`[DB] Solde insuffisant pour ${address}, paiement annule`);
        return;
      }

      await client.query(
        `INSERT INTO payments (address, amount, amount_nano, tx_hash, status, sent_at)
         VALUES ($1, $2, $3, $4, 'sent', NOW())`,
        [address, Number(amountNano) / 1e9, amountNano.toString(), txHash]
      );

      await client.query(
        `UPDATE miners SET total_paid = total_paid + $1 WHERE address = $2`,
        [Number(amountNano) / 1e9, address]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async recordFailedPayment(
    address: string,
    amountNano: bigint,
    errorMsg: string
  ): Promise<void> {
    await this.query(
      `INSERT INTO payments (address, amount, amount_nano, status, error_msg, retry_count)
       VALUES ($1, $2, $3, 'failed', $4, $5)`,
      [address, Number(amountNano) / 1e9, amountNano.toString(), errorMsg, config.payout.maxRetries]
    );
  }

  async getRecentPayments(limit: number = 50): Promise<any[]> {
    const result = await this.query(
      `SELECT address, amount_nano, tx_hash, status, error_msg, retry_count, sent_at, created_at
       FROM payments
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // Auto cleanup: keep max 5 'failed' payments per address
  async cleanOldFailedPayments(): Promise<number> {
    const result = await this.query(
      `DELETE FROM payments
       WHERE status = 'failed'
         AND id NOT IN (
           SELECT id FROM (
             SELECT id, ROW_NUMBER() OVER (PARTITION BY address ORDER BY created_at DESC) as rn
             FROM payments
             WHERE status = 'failed'
           ) sub
           WHERE rn <= 5
         )`
    );
    return result.rowCount || 0;
  }

  // Auto cleanup: delete shares older than 7 days
  async cleanOldShares(): Promise<number> {
    const result = await this.query(
      "DELETE FROM shares WHERE created_at < NOW() - INTERVAL '7 days'"
    );
    return result.rowCount || 0;
  }
}

export const database = new Database();
