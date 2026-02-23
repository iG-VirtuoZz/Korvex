import { xmrDatabase } from "./database";
import { daemon } from "../monero/daemon";
import { execFileSync } from "child_process";
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

    // Alerting: health check toutes les 5 minutes, disk toutes les heures
    setInterval(() => this.healthCheck(), 5 * 60 * 1000);
    setInterval(() => this.diskCheck(), 60 * 60 * 1000);
    setTimeout(() => this.healthCheck(), 30_000); // Premier check 30s apres boot
    console.log("[XMR Maintenance] Alerting Discord active (health: 5min, disk: 1h)");

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
      const shareResult = await xmrDatabase.query("DELETE FROM xmr_shares WHERE created_at < NOW() - INTERVAL '7 days'");
      if (shareResult.rowCount && shareResult.rowCount > 0) {
        console.log("[XMR Maintenance] Purge: " + shareResult.rowCount + " shares supprimees (>7 jours)");
      }

      await xmrDatabase.query("DELETE FROM xmr_pool_hashrate_1m WHERE ts_minute < NOW() - INTERVAL '90 days'");
      await xmrDatabase.query("DELETE FROM xmr_miner_hashrate_1m WHERE ts_minute < NOW() - INTERVAL '90 days'");
      await xmrDatabase.query("DELETE FROM xmr_worker_hashrate_1m WHERE ts_minute < NOW() - INTERVAL '90 days'");
    } catch (err) {
      console.error("[XMR Maintenance] Erreur purge:", err);
    }
  }

  // ── Alerting Discord ──────────────────────────────────────────
  private lastAlertTime: Record<string, number> = {};
  private readonly ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min entre alertes identiques

  private async sendDiscordAlert(title: string, message: string, color: number = 0xFF0000): Promise<void> {
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    if (!webhook) return;

    const now = Date.now();
    if (this.lastAlertTime[title] && (now - this.lastAlertTime[title]) < this.ALERT_COOLDOWN_MS) return;
    this.lastAlertTime[title] = now;

    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "\u26a0\ufe0f " + title,
            description: message,
            color,
            timestamp: new Date().toISOString(),
            footer: { text: "Korvex XMR Pool Alerting" },
          }],
        }),
      });
      console.log("[XMR Alerting] Alerte envoyee: " + title);
    } catch (err) {
      console.error("[XMR Alerting] Erreur envoi Discord:", err);
    }
  }

  private async healthCheck(): Promise<void> {
    try {
      // 1. Daemon repond ?
      const info = await daemon.getInfo();
      if (!info || !info.height) {
        await this.sendDiscordAlert(
          "Daemon Monero injoignable",
          "Le daemon monerod ne repond pas aux appels RPC."
        );
        return;
      }

      // 2. Synchronisation
      if (!info.synchronized) {
        await this.sendDiscordAlert(
          "Daemon Monero desynchronise",
          "Height: " + info.height + " — le daemon n'est pas synchronise."
        );
      }

      // 3. Reject rate > 2%
      const rejectResult = await xmrDatabase.query(
        "SELECT COUNT(*) FILTER (WHERE is_valid = false) as invalid, COUNT(*) as total FROM xmr_shares WHERE created_at > NOW() - INTERVAL '15 minutes'"
      );
      const invalid = parseInt(rejectResult.rows[0].invalid) || 0;
      const total = parseInt(rejectResult.rows[0].total) || 0;
      if (total > 10) {
        const rejectRate = (invalid / total) * 100;
        if (rejectRate > 2) {
          await this.sendDiscordAlert(
            "Reject rate eleve: " + rejectRate.toFixed(1) + "%",
            invalid + "/" + total + " shares invalides (15 min). Seuil: 2%",
            0xFFA500
          );
        }
      }

      // 4. Aucun share depuis > 10 min
      const lastShareResult = await xmrDatabase.query("SELECT MAX(created_at) as last FROM xmr_shares");
      if (lastShareResult.rows[0].last) {
        const age = Date.now() - new Date(lastShareResult.rows[0].last).getTime();
        if (age > 10 * 60 * 1000) {
          await this.sendDiscordAlert(
            "Aucun share depuis " + Math.round(age / 60000) + " min",
            "Aucun mineur ne soumet de shares. Verifier stratum port 3418."
          );
        }
      }
    } catch (err) {
      console.error("[XMR Alerting] Erreur health check:", err);
    }
  }

  private async diskCheck(): Promise<void> {
    try {
      // execFileSync = safe (pas de shell injection, args en array)
      const output = execFileSync("df", ["/", "--output=pcent"]).toString().trim();
      const lines = output.split("\n");
      const usagePercent = parseInt(lines[lines.length - 1].replace("%", "").trim());
      if (usagePercent > 90) {
        await this.sendDiscordAlert(
          "Disque presque plein: " + usagePercent + "%",
          "Espace disque VPS > 90%. Nettoyer ou augmenter le stockage.",
          0xFFA500
        );
      }
    } catch (_) {
      // Silencieux si df echoue
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
