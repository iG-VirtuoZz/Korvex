import { Pool, PoolClient } from "pg";
import { xmrConfig } from "../config";

// Base de donnees Monero — meme PostgreSQL que Ergo, tables prefixees xmr_

class XmrDatabase {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: xmrConfig.db.host,
      port: xmrConfig.db.port,
      database: xmrConfig.db.database,
      user: xmrConfig.db.user,
      password: xmrConfig.db.password,
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

  // ============================================
  // Shares
  // ============================================

  async recordShare(address: string, worker: string, shareDiff: number, blockDiff: number, blockHeight: number, isValid: boolean, miningMode: string = "pplns") {
    await this.query(
      "INSERT INTO xmr_shares (address, worker, share_diff, block_diff, block_height, is_valid, mining_mode) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [address, worker, shareDiff, blockDiff, blockHeight, isValid, miningMode]
    );
    await this.query(
      "INSERT INTO xmr_miners (address) VALUES ($1) ON CONFLICT (address) DO UPDATE SET last_seen=NOW(), total_shares=xmr_miners.total_shares+1",
      [address]
    );
  }

  // ============================================
  // Blocs
  // ============================================

  async recordBlock(height: number, hash: string, reward: number, difficulty: number, finderAddress: string, finderWorker: string, effortPercent: number | null, miningMode: string = "pplns") {
    await this.query(
      "INSERT INTO xmr_blocks (height,hash,reward,difficulty,finder_address,finder_worker,effort_percent,mining_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (height) DO NOTHING",
      [height, hash, reward, difficulty, finderAddress, finderWorker, effortPercent, miningMode]
    );
    await this.query(
      "UPDATE xmr_miners SET total_blocks=total_blocks+1 WHERE address=$1",
      [finderAddress]
    );
  }

  // ============================================
  // Effort / Luck
  // ============================================

  async getEffortSinceLastBlock(miningMode: string = "pplns"): Promise<number> {
    const lastBlock = await this.query(
      "SELECT created_at FROM xmr_blocks WHERE mining_mode = $1 ORDER BY height DESC LIMIT 1",
      [miningMode]
    );

    let effort: number;
    if (lastBlock.rows.length > 0) {
      const result = await this.query(
        "SELECT COALESCE(SUM(share_diff::double precision / NULLIF(block_diff::double precision, 0)), 0) as total FROM xmr_shares WHERE is_valid = true AND share_diff > 0 AND mining_mode = $1 AND created_at > $2",
        [miningMode, lastBlock.rows[0].created_at]
      );
      effort = parseFloat(result.rows[0].total) || 0;
    } else {
      const result = await this.query(
        "SELECT COALESCE(SUM(share_diff::double precision / NULLIF(block_diff::double precision, 0)), 0) as total FROM xmr_shares WHERE is_valid = true AND share_diff > 0 AND mining_mode = $1",
        [miningMode]
      );
      effort = parseFloat(result.rows[0].total) || 0;
    }

    return effort;
  }

  async getAverageEffort(limit: number = 20): Promise<number | null> {
    const result = await this.query(
      "SELECT AVG(effort_percent) as avg_effort FROM (SELECT effort_percent FROM xmr_blocks WHERE effort_percent IS NOT NULL ORDER BY height DESC LIMIT $1) sub",
      [limit]
    );
    const avg = parseFloat(result.rows[0].avg_effort);
    return isNaN(avg) ? null : avg;
  }

  // ============================================
  // PPLNS
  // ============================================

  async getSharesForPPLNS(windowDiff: number): Promise<Array<{ address: string; share_diff: number }>> {
    const batchSize = 1000;
    let offset = 0;
    let cumulDiff = 0;
    const result: Array<{ address: string; share_diff: number }> = [];

    while (cumulDiff < windowDiff) {
      const batch = await this.query(
        `SELECT address, share_diff FROM xmr_shares
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
    rewards: Array<{ address: string; shareCount: number; shareDiffSum: number; amountPico: bigint }>,
    rewardPico: bigint,
    pplnsShares: number,
    pplnsDiffSum: number
  ): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query("BEGIN");

      for (const r of rewards) {
        await client.query(
          `INSERT INTO xmr_block_rewards (block_height, address, amount, share_count, share_diff_sum)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (block_height, address) DO NOTHING`,
          [blockHeight, r.address, r.amountPico.toString(), r.shareCount, r.shareDiffSum]
        );
      }

      await client.query(
        `UPDATE xmr_blocks
         SET reward_pico = $1, pplns_shares = $2, pplns_diff_sum = $3, reward_distributed = false
         WHERE height = $4`,
        [rewardPico.toString(), pplnsShares, pplnsDiffSum, blockHeight]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // ============================================
  // Confirmations + Paiements
  // ============================================

  async getPendingBlocks(): Promise<Array<{ height: number; hash: string; reward_pico: string; created_at: string }>> {
    const result = await this.query(
      `SELECT height, hash, reward_pico, created_at FROM xmr_blocks
       WHERE reward_distributed = false
         AND is_orphan = false
         AND reward_pico > 0
       ORDER BY height ASC`
    );
    return result.rows;
  }

  async markBlockOrphan(blockHeight: number): Promise<void> {
    await this.query(
      `UPDATE xmr_blocks SET is_orphan = true, status = 'orphan' WHERE height = $1`,
      [blockHeight]
    );
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
       FROM xmr_block_rewards
       WHERE block_height = $1
       ORDER BY amount DESC`,
      [blockHeight]
    );
    return result.rows;
  }

  async confirmBlockAndCreditBalances(blockHeight: number): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query("BEGIN");

      const blockCheck = await client.query(
        "SELECT reward_distributed FROM xmr_blocks WHERE height = $1 FOR UPDATE",
        [blockHeight]
      );
      if (blockCheck.rows.length === 0 || blockCheck.rows[0].reward_distributed === true) {
        await client.query("ROLLBACK");
        return;
      }

      const rewards = await client.query(
        "SELECT address, amount FROM xmr_block_rewards WHERE block_height = $1",
        [blockHeight]
      );

      for (const row of rewards.rows) {
        await client.query(
          `INSERT INTO xmr_balances (address, amount) VALUES ($1, $2)
           ON CONFLICT (address) DO UPDATE SET amount = xmr_balances.amount + $2`,
          [row.address, row.amount]
        );
      }

      await client.query(
        `UPDATE xmr_blocks
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

  async getBalance(address: string): Promise<bigint> {
    const result = await this.query(
      "SELECT amount FROM xmr_balances WHERE address = $1",
      [address]
    );
    if (result.rows.length === 0) return BigInt(0);
    return BigInt(result.rows[0].amount);
  }

  async getPayableBalances(minPayoutPico: bigint, excludeAddress?: string): Promise<Array<{ address: string; amount: bigint }>> {
    const query = excludeAddress
      ? "SELECT address, amount FROM xmr_balances WHERE amount >= $1 AND address != $2 ORDER BY amount DESC"
      : "SELECT address, amount FROM xmr_balances WHERE amount >= $1 ORDER BY amount DESC";
    const params = excludeAddress
      ? [minPayoutPico.toString(), excludeAddress]
      : [minPayoutPico.toString()];
    const result = await this.query(query, params);
    return result.rows.map((row: any) => ({
      address: row.address,
      amount: BigInt(row.amount),
    }));
  }

  // ============================================
  // Paiements safe — prepare + finalize
  // ============================================

  async prepareBatchPayments(
    entries: Array<{ address: string; amount: bigint }>
  ): Promise<Array<{ id: number; address: string; amount: bigint }>> {
    const client = await this.getClient();
    try {
      await client.query("BEGIN");

      const prepared: Array<{ id: number; address: string; amount: bigint }> = [];

      for (const entry of entries) {
        const debit = await client.query(
          `UPDATE xmr_balances SET amount = amount - $1
           WHERE address = $2 AND amount >= $1
           RETURNING amount`,
          [entry.amount.toString(), entry.address]
        );

        if (debit.rows.length === 0) {
          console.error("[XMR DB] prepareBatch: solde insuffisant pour " + entry.address + ", skip");
          continue;
        }

        const payment = await client.query(
          `INSERT INTO xmr_payments (address, amount, amount_pico, status, created_at)
           VALUES ($1, $2, $3, 'pending', NOW())
           RETURNING id`,
          [entry.address, Number(entry.amount) / 1e12, entry.amount.toString()]
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

  async finalizeBatchPayments(paymentIds: number[], txHash: string): Promise<void> {
    if (paymentIds.length === 0) return;
    const client = await this.getClient();
    try {
      await client.query("BEGIN");

      for (const id of paymentIds) {
        await client.query(
          `UPDATE xmr_payments SET status = 'sent', tx_hash = $1, sent_at = NOW() WHERE id = $2 AND status = 'pending'`,
          [txHash, id]
        );
      }

      const payments = await client.query(
        `SELECT address, amount_pico FROM xmr_payments WHERE id = ANY($1)`,
        [paymentIds]
      );
      for (const row of payments.rows) {
        await client.query(
          `UPDATE xmr_miners SET total_paid = total_paid + $1 WHERE address = $2`,
          [Number(BigInt(row.amount_pico)) / 1e12, row.address]
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

  async markBatchPaymentsUnknown(paymentIds: number[], errorMsg: string): Promise<void> {
    if (paymentIds.length === 0) return;
    const client = await this.getClient();
    try {
      await client.query("BEGIN");
      for (const id of paymentIds) {
        await client.query(
          `UPDATE xmr_payments SET status = 'unknown', error_msg = $1 WHERE id = $2 AND status = 'pending'`,
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

  async hasUnresolvedPayments(): Promise<boolean> {
    const result = await this.query(
      "SELECT COUNT(*) as count FROM xmr_payments WHERE status = 'unknown'"
    );
    return parseInt(result.rows[0].count) > 0;
  }

  async getRecentPayments(limit: number = 50): Promise<any[]> {
    const result = await this.query(
      `SELECT address, amount_pico, tx_hash, status, error_msg, retry_count, sent_at, created_at
       FROM xmr_payments
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async cleanOldFailedPayments(): Promise<number> {
    const result = await this.query(
      `DELETE FROM xmr_payments
       WHERE status = 'failed'
         AND id NOT IN (
           SELECT id FROM (
             SELECT id, ROW_NUMBER() OVER (PARTITION BY address ORDER BY created_at DESC) as rn
             FROM xmr_payments
             WHERE status = 'failed'
           ) sub
           WHERE rn <= 5
         )`
    );
    return result.rowCount || 0;
  }

  async cleanOldShares(): Promise<number> {
    const result = await this.query(
      "DELETE FROM xmr_shares WHERE created_at < NOW() - INTERVAL '7 days'"
    );
    return result.rowCount || 0;
  }
}

export const xmrDatabase = new XmrDatabase();
