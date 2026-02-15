import { database } from "./database";
import { ergoNode } from "../ergo/node";
import { config } from "../config";
import { runConfirmer } from "../payout/confirmer";
import { runPayer } from "../payout/payer";

class Maintenance {
  private running = false;
  private lastSnapshotDifficulty = 0;
  private lastSnapshotTime = 0;
  private payoutCycleRunning = false;

  start() {
    if (this.running) return;
    this.running = true;
    console.log("[Maintenance] Demarrage des taches periodiques");

    setInterval(() => this.aggregate(), 60_000);
    setInterval(() => this.recordNetworkSnapshot(), 60_000);
    setInterval(() => this.purge(), 3_600_000);

    const payoutIntervalMs = config.payout.intervalMinutes * 60 * 1000;
    console.log("[Maintenance] Cycle confirmations+paiements toutes les " + config.payout.intervalMinutes + " minutes");
    setInterval(() => this.runPayoutCycle(), payoutIntervalMs);
    setTimeout(() => this.runPayoutCycle(), 30_000);
  }

  private async aggregate(): Promise<void> {
    try {
      for (const mode of ['pplns', 'solo']) {
        // Pool hashrate par mode
        await database.query(
          "INSERT INTO pool_hashrate_1m (ts_minute, mining_mode, diff_sum, share_count) " +
          "SELECT ts_min, $1::varchar, COALESCE(SUM(s.share_diff), 0), COUNT(s.*) " +
          "FROM ( " +
          "  SELECT date_trunc('minute', NOW()) as ts_min " +
          "  UNION ALL " +
          "  SELECT date_trunc('minute', NOW()) - INTERVAL '1 minute' " +
          ") minutes " +
          "LEFT JOIN shares s ON s.created_at >= ts_min AND s.created_at < ts_min + INTERVAL '1 minute' AND s.mining_mode = $1 " +
          "GROUP BY ts_min " +
          "ON CONFLICT (ts_minute, mining_mode) DO UPDATE " +
          "SET diff_sum = EXCLUDED.diff_sum, share_count = EXCLUDED.share_count",
          [mode]
        );

        // Miner hashrate par mode
        await database.query(
          "INSERT INTO miner_hashrate_1m (ts_minute, address, mining_mode, diff_sum, share_count) " +
          "SELECT ts_min, s.address, $1::varchar, COALESCE(SUM(s.share_diff), 0), COUNT(*) " +
          "FROM ( " +
          "  SELECT date_trunc('minute', NOW()) as ts_min " +
          "  UNION ALL " +
          "  SELECT date_trunc('minute', NOW()) - INTERVAL '1 minute' " +
          ") minutes " +
          "INNER JOIN shares s ON s.created_at >= ts_min AND s.created_at < ts_min + INTERVAL '1 minute' AND s.mining_mode = $1 " +
          "GROUP BY ts_min, s.address " +
          "ON CONFLICT (ts_minute, address, mining_mode) DO UPDATE " +
          "SET diff_sum = EXCLUDED.diff_sum, share_count = EXCLUDED.share_count",
          [mode]
        );

        // Worker hashrate par mode
        await database.query(
          "INSERT INTO worker_hashrate_1m (ts_minute, address, worker, mining_mode, diff_sum, share_count) " +
          "SELECT ts_min, s.address, s.worker, $1::varchar, COALESCE(SUM(s.share_diff), 0), COUNT(*) " +
          "FROM ( " +
          "  SELECT date_trunc('minute', NOW()) as ts_min " +
          "  UNION ALL " +
          "  SELECT date_trunc('minute', NOW()) - INTERVAL '1 minute' " +
          ") minutes " +
          "INNER JOIN shares s ON s.created_at >= ts_min AND s.created_at < ts_min + INTERVAL '1 minute' AND s.mining_mode = $1 " +
          "GROUP BY ts_min, s.address, s.worker " +
          "ON CONFLICT (ts_minute, address, worker, mining_mode) DO UPDATE " +
          "SET diff_sum = EXCLUDED.diff_sum, share_count = EXCLUDED.share_count",
          [mode]
        );
      }
    } catch (err) {
      console.error("[Maintenance] Erreur agregation:", err);
    }
  }

  private async recordNetworkSnapshot(): Promise<void> {
    try {
      const info = await ergoNode.getInfo();
      if (!info.difficulty || !info.fullHeight) return;

      const now = Date.now();
      const diffChanged = info.difficulty !== this.lastSnapshotDifficulty;
      const fiveMinPassed = (now - this.lastSnapshotTime) >= 5 * 60 * 1000;

      if (!diffChanged && !fiveMinPassed) return;

      this.lastSnapshotDifficulty = info.difficulty;
      this.lastSnapshotTime = now;

      await database.query(
        "INSERT INTO network_snapshots (ts, difficulty, height) VALUES (NOW(), $1, $2)",
        [info.difficulty, info.fullHeight]
      );

      if (diffChanged) {
        console.log("[Maintenance] Nouvelle difficulte: " + info.difficulty + " hauteur=" + info.fullHeight);
      }
    } catch (err) {
      console.error("[Maintenance] Erreur snapshot:", err);
    }
  }

  private async purge(): Promise<void> {
    try {
      const shareResult = await database.query("DELETE FROM shares WHERE created_at < NOW() - INTERVAL '30 days'");
      if (shareResult.rowCount && shareResult.rowCount > 0) {
        console.log("[Maintenance] Purge: " + shareResult.rowCount + " shares supprimees (>30 jours)");
      }

      await database.query("DELETE FROM pool_hashrate_1m WHERE ts_minute < NOW() - INTERVAL '90 days'");
      await database.query("DELETE FROM miner_hashrate_1m WHERE ts_minute < NOW() - INTERVAL '90 days'");
      await database.query("DELETE FROM worker_hashrate_1m WHERE ts_minute < NOW() - INTERVAL '90 days'");
    } catch (err) {
      console.error("[Maintenance] Erreur purge:", err);
    }
  }

  private async runPayoutCycle(): Promise<void> {
    if (this.payoutCycleRunning) {
      console.log("[Maintenance] Cycle payout deja en cours, skip");
      return;
    }
    this.payoutCycleRunning = true;

    try {
      const confirmResult = await runConfirmer();
      if (confirmResult.confirmed > 0 || confirmResult.orphaned > 0) {
        console.log("[Maintenance] Confirmations: " + confirmResult.confirmed + " confirme(s), " + confirmResult.orphaned + " orphan(s)");
      }

      // Si un bloc vient d'etre confirme dans ce cycle, skip le payer
      // Le wallet du noeud a besoin de quelques minutes pour rendre les UTXOs disponibles
      // Le paiement passera au prochain cycle (10 min)
      if (confirmResult.confirmed > 0) {
        console.log("[Maintenance] Bloc confirme dans ce cycle, paiement reporte au prochain cycle (UTXOs pas encore disponibles)");
      } else {
        const payResult = await runPayer();
        if (payResult.sent > 0 || payResult.failed > 0) {
          console.log("[Maintenance] Paiements: " + payResult.sent + " envoye(s), " + payResult.failed + " echoue(s)");
        }
      }
    } catch (err) {
      console.error("[Maintenance] Erreur cycle payout:", err);
    } finally {
      this.payoutCycleRunning = false;
    }
  }
}

export const maintenance = new Maintenance();
