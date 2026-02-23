import { xmrConfig } from "../config";
import { xmrDatabase } from "../db/database";
import { daemon } from "../monero/daemon";
import { distributeXmrPPLNS } from "./pplns";

// Confirmateur de blocs Monero
// Attend 60 confirmations (standard Monero) au lieu de 720 (Ergo)

export async function runXmrConfirmer(): Promise<{ confirmed: number; orphaned: number }> {
  let confirmed = 0;
  let orphaned = 0;

  try {
    const info = await daemon.getInfo();
    const currentHeight = info.height;
    if (!currentHeight) {
      console.log("[XMR Confirmer] Impossible de recuperer la hauteur du reseau");
      return { confirmed: 0, orphaned: 0 };
    }

    const pendingBlocks = await xmrDatabase.getPendingBlocks();

    if (pendingBlocks.length === 0) {
      return { confirmed: 0, orphaned: 0 };
    }

    console.log(`[XMR Confirmer] ${pendingBlocks.length} bloc(s) en attente de confirmation`);

    for (const block of pendingBlocks) {
      const blockHeight = block.height;
      const blockHash = block.hash;
      const confirmations = currentHeight - blockHeight;

      if (confirmations < xmrConfig.payout.confirmations) {
        console.log(`[XMR Confirmer] Bloc ${blockHeight}: ${confirmations}/${xmrConfig.payout.confirmations} confirmations, en attente...`);
        continue;
      }

      // Verifier si le bloc est toujours dans la blockchain
      try {
        const header = await daemon.getBlockHeaderByHeight(blockHeight);

        if (header.orphan_status) {
          console.log(`[XMR Confirmer] !!! ORPHAN !!! Bloc ${blockHeight}`);
          await xmrDatabase.markBlockOrphan(blockHeight);
          orphaned++;
          continue;
        }

        // Verifier le hash si on l'a
        if (blockHash && !blockHash.startsWith("unknown_") && header.hash !== blockHash) {
          console.log(`[XMR Confirmer] !!! ORPHAN !!! Bloc ${blockHeight} hash mismatch`);
          await xmrDatabase.markBlockOrphan(blockHeight);
          orphaned++;
          continue;
        }
      } catch (err) {
        // En cas d'erreur reseau, ne pas marquer orphan (reessayer au prochain cycle)
        console.warn(`[XMR Confirmer] Erreur verification bloc ${blockHeight}, presume valide:`, err);
        continue;
      }

      // Verifier si les block_rewards existent
      const rewards = await xmrDatabase.getBlockRewards(blockHeight);
      if (rewards.length === 0) {
        console.warn(`[XMR Confirmer] !!! Bloc ${blockHeight} sans block_rewards — re-distribution necessaire !!!`);
        try {
          await redistributeBlock(blockHeight);
          const recheck = await xmrDatabase.getBlockRewards(blockHeight);
          if (recheck.length === 0) {
            console.error(`[XMR Confirmer] Re-distribution echouee pour bloc ${blockHeight}, skip`);
            continue;
          }
        } catch (redistErr) {
          console.error(`[XMR Confirmer] Erreur re-distribution bloc ${blockHeight}:`, redistErr);
          continue;
        }
      }

      console.log(`[XMR Confirmer] Bloc ${blockHeight} confirme (${confirmations} confirmations), credit des balances...`);

      try {
        await xmrDatabase.confirmBlockAndCreditBalances(blockHeight);
        confirmed++;
        console.log(`[XMR Confirmer] Bloc ${blockHeight} : balances creditees avec succes`);
      } catch (err) {
        console.error(`[XMR Confirmer] Erreur credit bloc ${blockHeight}:`, err);
      }
    }
  } catch (err) {
    console.error("[XMR Confirmer] Erreur globale:", err);
  }

  if (confirmed > 0 || orphaned > 0) {
    console.log(`[XMR Confirmer] Resultat: ${confirmed} confirme(s), ${orphaned} orphan(s)`);
  }

  return { confirmed, orphaned };
}

// Re-distribuer un bloc dont les block_rewards sont manquants
async function redistributeBlock(blockHeight: number): Promise<void> {
  const blockResult = await xmrDatabase.query(
    "SELECT height, difficulty, finder_address, mining_mode, reward FROM xmr_blocks WHERE height = $1",
    [blockHeight]
  );
  if (blockResult.rows.length === 0) {
    throw new Error("Bloc " + blockHeight + " introuvable en DB");
  }

  const block = blockResult.rows[0];

  // Recuperer la recompense depuis le header du bloc
  let rewardPico: bigint;
  try {
    const header = await daemon.getBlockHeaderByHeight(blockHeight);
    rewardPico = BigInt(header.reward);
  } catch {
    // Fallback sur la valeur en DB
    rewardPico = BigInt(block.reward || 0);
  }

  console.log("[XMR Confirmer] Re-distribution bloc " + blockHeight +
    " reward=" + (Number(rewardPico) / 1e12).toFixed(6) + " XMR");

  await distributeXmrPPLNS(blockHeight, rewardPico, parseFloat(block.difficulty));
}
