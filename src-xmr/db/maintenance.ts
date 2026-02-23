import { xmrDatabase } from "./database";
import { daemon } from "../monero/daemon";
import { xmrConfig } from "../config";
import { runXmrConfirmer } from "../payout/confirmer";
import { runXmrPayer } from "../payout/payer";

class XmrMaintenance {
  private running = false;
  private lastSnapshotDifficulty = 0;
  private lastSnapshotTime = 0;
  private payoutCycleRunning = false;

  start() {
    if (this.running) return;
    this.running = true;
    console.log("[XMR Maintenance] Demarrage des taches periodiques");

    setInterval(() => this.aggregate(), 60_000);
    setInterval(() => this.recordNetworkSnapshot(), 60_000);
    setInterval(() => this.purge(), 3_600_000);

    const payoutIntervalMs = xmrConfig.payout.intervalMinutes * 60 * 1000;
    console.log("[XMR Maintenance] Cycle confirmations+paiements toutes les " + xmrConfig.payout.intervalMinutes + " minutes");
    setInterval(() => this.runPayoutCycle(), payoutIntervalMs);
    setTimeout(() => this.runPayoutCycle(), 60_000); // 1 min apres le boot
  }

  private async aggregate(): Promise<void> {
    try {
      // Fenetre de 5 minutes pour re-agreger les shares en retard
      // ON CONFLICT DO UPDATE corrige les valeurs precedentes si de nouveaux shares arrivent
      const minutesWindow =
        "  SELECT date_trunc('minute', NOW()) as ts_min " +
        "  UNION ALL SELECT date_trunc('minute', NOW()) - INTERVAL '1 minute' " +
        "  UNION ALL SELECT date_trunc('minute', NOW()) - INTERVAL '2 minutes' " +
        "  UNION ALL SELECT date_trunc('minute', NOW()) - INTERVAL '3 minutes' " +
        "  UNION ALL SELECT date_trunc('minute', NOW()) - INTERVAL '4 minutes'";

      // Pool hashrate
      await xmrDatabase.query(
        "INSERT INTO xmr_pool_hashrate_1m (ts_minute, mining_mode, diff_sum, share_count) " +
        "SELECT ts_min, 'pplns'::varchar, COALESCE(SUM(s.share_diff), 0), COUNT(s.*) " +
        "FROM ( " +
        minutesWindow +
        ") minutes " +
        "LEFT JOIN xmr_shares s ON s.created_at >= ts_min AND s.created_at < ts_min + INTERVAL '1 minute' AND s.mining_mode = 'pplns' " +
        "GROUP BY ts_min " +
        "ON CONFLICT (ts_minute, mining_mode) DO UPDATE " +
        "SET diff_sum = EXCLUDED.diff_sum, share_count = EXCLUDED.share_count"
      );

      // Miner hashrate
      await xmrDatabase.query(
        "INSERT INTO xmr_miner_hashrate_1m (ts_minute, address, mining_mode, diff_sum, share_count) " +
        "SELECT ts_min, s.address, 'pplns'::varchar, COALESCE(SUM(s.share_diff), 0), COUNT(*) " +
        "FROM ( " +
        minutesWindow +
        ") minutes " +
        "INNER JOIN xmr_shares s ON s.created_at >= ts_min AND s.created_at < ts_min + INTERVAL '1 minute' AND s.mining_mode = 'pplns' " +
        "GROUP BY ts_min, s.address " +
        "ON CONFLICT (ts_minute, address, mining_mode) DO UPDATE " +
        "SET diff_sum = EXCLUDED.diff_sum, share_count = EXCLUDED.share_count"
      );

      // Worker hashrate
      await xmrDatabase.query(
        "INSERT INTO xmr_worker_hashrate_1m (ts_minute, address, worker, mining_mode, diff_sum, share_count) " +
        "SELECT ts_min, s.address, s.worker, 'pplns'::varchar, COALESCE(SUM(s.share_diff), 0), COUNT(*) " +
        "FROM ( " +
        minutesWindow +
        ") minutes " +
        "INNER JOIN xmr_shares s ON s.created_at >= ts_min AND s.created_at < ts_min + INTERVAL '1 minute' AND s.mining_mode = 'pplns' " +
        "GROUP BY ts_min, s.address, s.worker " +
        "ON CONFLICT (ts_minute, address, worker, mining_mode) DO UPDATE " +
        "SET diff_sum = EXCLUDED.diff_sum, share_count = EXCLUDED.share_count"
      );
    } catch (err) {
      console.error("[XMR Maintenance] Erreur agregation:", err);
    }
  }

  private async recordNetworkSnapshot(): Promise<void> {
    try {
      const info = await daemon.getInfo();
      if (!info.difficulty || !info.height) return;

      const now = Date.now();
      const diffChanged = info.difficulty !== this.lastSnapshotDifficulty;
      const fiveMinPassed = (now - this.lastSnapshotTime) >= 5 * 60 * 1000;

      if (!diffChanged && !fiveMinPassed) return;

      this.lastSnapshotDifficulty = info.difficulty;
      this.lastSnapshotTime = now;

      await xmrDatabase.query(
        "INSERT INTO xmr_network_snapshots (ts, difficulty, height) VALUES (NOW(), $1, $2)",
        [info.difficulty, info.height]
      );

      if (diffChanged) {
        console.log("[XMR Maintenance] Nouvelle difficulte: " + info.difficulty + " hauteur=" + info.height);
      }
    } catch (err) {
      console.error("[XMR Maintenance] Erreur snapshot:", err);
    }
  }

  private async purge(): Promise<void> {
    try {
      const shareResult = await xmrDatabase.query("DELETE FROM xmr_shares WHERE created_at < NOW() - INTERVAL '30 days'");
      if (shareResult.rowCount && shareResult.rowCount > 0) {
        console.log("[XMR Maintenance] Purge: " + shareResult.rowCount + " shares supprimees (>30 jours)");
      }

      await xmrDatabase.query("DELETE FROM xmr_pool_hashrate_1m WHERE ts_minute < NOW() - INTERVAL '90 days'");
      await xmrDatabase.query("DELETE FROM xmr_miner_hashrate_1m WHERE ts_minute < NOW() - INTERVAL '90 days'");
      await xmrDatabase.query("DELETE FROM xmr_worker_hashrate_1m WHERE ts_minute < NOW() - INTERVAL '90 days'");
    } catch (err) {
      console.error("[XMR Maintenance] Erreur purge:", err);
    }
  }

  private async runPayoutCycle(): Promise<void> {
    if (this.payoutCycleRunning) {
      console.log("[XMR Maintenance] Cycle payout deja en cours, skip");
      return;
    }
    this.payoutCycleRunning = true;

    try {
      const confirmResult = await runXmrConfirmer();
      if (confirmResult.confirmed > 0 || confirmResult.orphaned > 0) {
        console.log("[XMR Maintenance] Confirmations: " + confirmResult.confirmed + " confirme(s), " + confirmResult.orphaned + " orphan(s)");
      }

      // Si un bloc vient d'etre confirme, skip le payer (attendre le prochain cycle)
      if (confirmResult.confirmed > 0) {
        console.log("[XMR Maintenance] Bloc confirme dans ce cycle, paiement reporte au prochain cycle");
      } else {
        const payResult = await runXmrPayer();
        if (payResult.sent > 0 || payResult.failed > 0) {
          console.log("[XMR Maintenance] Paiements: " + payResult.sent + " envoye(s), " + payResult.failed + " echoue(s)");
        }
      }
    } catch (err) {
      console.error("[XMR Maintenance] Erreur cycle payout:", err);
    } finally {
      this.payoutCycleRunning = false;
    }
  }
}

export const xmrMaintenance = new XmrMaintenance();
