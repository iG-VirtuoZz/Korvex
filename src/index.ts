import { config } from "./config";
import { ergoNode } from "./ergo/node";
import { database } from "./db/database";
import { maintenance } from "./db/maintenance";
import { StratumServer } from "./stratum/server";
import { createApi } from "./api/api";
import { lockWallet } from "./payout/payer";

console.log("===========================================");
console.log("  KORVEX Pool v0.4.0 - ERGO Mining Pool");
console.log("===========================================");

async function main() {
  try {
    await database.query("SELECT 1");
    console.log("[DB] PostgreSQL connecte");

    // Lock wallet au demarrage (best-effort)
    // Couvre le cas ou le process precedent a crashe entre unlock et lock
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

    const stratum = new StratumServer();
    await stratum.start();

    createApi(() => ({
      sessions: stratum.getSessionCount(),
      miners: stratum.getAuthorizedMiners(),
    }));

    maintenance.start();

    console.log("[Pool] KORVEX demarree avec succes !");
  } catch (err) {
    console.error("[Pool] Erreur au demarrage:", err);
    process.exit(1);
  }
}

main();
