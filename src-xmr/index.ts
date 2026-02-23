import { xmrConfig } from "./config";
import { daemon } from "./monero/daemon";
import { xmrDatabase } from "./db/database";
import { xmrMaintenance } from "./db/maintenance";
import { XmrStratumServer } from "./stratum/server";
import { createXmrApi } from "./api/api";

// --- Handlers globaux ---
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
});

console.log("===========================================");
console.log("  KORVEX Pool v0.4.0 - MONERO Mining Pool");
console.log("  Algorithme: RandomX | Port Stratum: " + xmrConfig.stratum.port);
console.log("  API: http://127.0.0.1:" + xmrConfig.api.port);
console.log("===========================================");

let stratum: XmrStratumServer | null = null;

async function main() {
  try {
    await xmrDatabase.query("SELECT 1");
    console.log("[DB] PostgreSQL connecte");

    const info = await daemon.getInfo();
    console.log("[Daemon] Monero connecte - Hauteur: " + info.height + " Synced: " + info.synchronized);

    if (!info.synchronized) {
      console.log("[Daemon] En attente de synchronisation...");
    }

    stratum = new XmrStratumServer();
    await stratum.start();

    createXmrApi(
      () => ({
        sessions: stratum!.getSessionCount(),
        miners: stratum!.getAuthorizedMiners(),
      }),
      () => stratum!.getDiceRolls()
    );

    xmrMaintenance.start();

    console.log("[Pool] KORVEX Monero demarree avec succes !");
  } catch (err) {
    console.error("[Pool] Erreur au demarrage:", err);
    process.exit(1);
  }
}

// --- Graceful shutdown ---
async function gracefulShutdown(signal: string) {
  console.log("[Pool] Signal " + signal + " recu, arret en cours...");
  try {
    if (stratum) {
      await stratum.stop();
      console.log("[Pool] Stratum arrete");
    }
  } catch (err) {
    console.error("[Pool] Erreur arret stratum:", err);
  }
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

main();
