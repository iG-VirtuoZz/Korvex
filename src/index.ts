import { config } from "./config";
import { ergoNode } from "./ergo/node";
import { database } from "./db/database";
import { maintenance } from "./db/maintenance";
import { StratumServer } from "./stratum/server";
import { createApi } from "./api/api";
import { lockWallet } from "./payout/payer";

// --- Global handlers: never crash silently ---
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  // We don't force process.exit(): the process continues but we are warned
});

console.log("===========================================");
console.log("  KORVEX Pool v0.4.0 - ERGO Mining Pool");
console.log("===========================================");

let stratum: StratumServer | null = null;

async function main() {
  try {
    await database.query("SELECT 1");
    console.log("[DB] PostgreSQL connecte");

    // Lock wallet at startup (best-effort)
    // Covers the case where the previous process crashed between unlock and lock
    if (config.payout.walletPass) {
      try {
        await lockWallet();
        console.log("[Boot] Wallet lock best-effort OK");
      } catch (err) {
        console.error("[Boot] Erreur lock wallet au demarrage (non bloquant):", err);
      }
    }

    const info = await ergoNode.getInfo();
    console.log("[Node] ERGO connecte - Hauteur:", info.fullHeight);

    stratum = new StratumServer();
    await stratum.start();

    createApi(
      (mode?: string) => ({
        sessions: stratum!.getSessionCount(mode),
        miners: stratum!.getAuthorizedMiners(mode),
      }),
      () => stratum!.getDiceRolls()
    );

    maintenance.start();

    console.log("[Pool] KORVEX demarree avec succes !");
  } catch (err) {
    console.error("[Pool] Erreur au demarrage:", err);
    process.exit(1);
  }
}

// --- Graceful shutdown: lock wallet + close stratum properly ---
async function gracefulShutdown(signal: string) {
  console.log("[Pool] Signal " + signal + " recu, arret en cours...");
  try {
    if (config.payout.walletPass) {
      await lockWallet();
      console.log("[Pool] Wallet verrouille avant arret");
    }
  } catch (err) {
    console.error("[Pool] Erreur lock wallet a l'arret:", err);
  }
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
