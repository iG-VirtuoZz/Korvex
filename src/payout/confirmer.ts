import { config } from "../config";
import { database } from "../db/database";
import { ergoNode } from "../ergo/node";
import { distributePPLNS } from "./pplns";
import { distributeSolo } from "./solo";

export async function runConfirmer(): Promise<{ confirmed: number; orphaned: number }> {
  let confirmed = 0;
  let orphaned = 0;

  try {
    const info = await ergoNode.getInfo();
    const currentHeight = info.fullHeight;
    if (!currentHeight) {
      console.log("[Confirmer] Impossible de recuperer la hauteur du reseau");
      return { confirmed: 0, orphaned: 0 };
    }

    const pendingBlocks = await database.getPendingBlocks();

    if (pendingBlocks.length === 0) {
      return { confirmed: 0, orphaned: 0 };
    }

    console.log(`[Confirmer] ${pendingBlocks.length} bloc(s) en attente de confirmation`);

    for (const block of pendingBlocks) {
      const blockHeight = block.height;
      const blockId = block.hash;
      const confirmations = currentHeight - blockHeight;

      if (confirmations < config.payout.confirmations) {
        console.log(`[Confirmer] Bloc ${blockHeight}: ${confirmations}/${config.payout.confirmations} confirmations, en attente...`);
        continue;
      }

      if (!blockId || blockId.startsWith("unknown_")) {
        console.log(`[Confirmer] Bloc ${blockHeight}: blockId manquant, verification basique`);
        const blockIds = await ergoNode.getBlockIdsAtHeight(blockHeight);
        if (blockIds.length === 0) {
          console.log(`[Confirmer] !!! ORPHAN !!! Bloc ${blockHeight} n'est plus dans la blockchain`);
          await database.markBlockOrphan(blockHeight);
          orphaned++;
          continue;
        }
      } else {
        const isValid = await ergoNode.isBlockOnChain(blockHeight, blockId);
        if (!isValid) {
          console.log(`[Confirmer] !!! ORPHAN !!! Bloc ${blockHeight} (id=${blockId.substring(0, 16)}...) n'est plus dans la blockchain`);
          await database.markBlockOrphan(blockHeight);
          orphaned++;
          continue;
        }
      }

      // Verifier si les block_rewards existent (protection crash entre recordBlock et distribution)
      const rewards = await database.getBlockRewards(blockHeight);
      if (rewards.length === 0) {
        console.warn(`[Confirmer] !!! Bloc ${blockHeight} sans block_rewards — re-distribution necessaire !!!`);
        try {
          await redistributeBlock(blockHeight);
          // Verifier que la distribution a fonctionne
          const recheck = await database.getBlockRewards(blockHeight);
          if (recheck.length === 0) {
            console.error(`[Confirmer] Re-distribution echouee pour bloc ${blockHeight}, skip`);
            continue;
          }
          console.log(`[Confirmer] Re-distribution reussie pour bloc ${blockHeight} (${recheck.length} rewards)`);
        } catch (redistErr) {
          console.error(`[Confirmer] Erreur re-distribution bloc ${blockHeight}:`, redistErr);
          continue;
        }
      }

      console.log(`[Confirmer] Bloc ${blockHeight} confirme (${confirmations} confirmations), credit des balances...`);

      try {
        await database.confirmBlockAndCreditBalances(blockHeight);
        confirmed++;
        console.log(`[Confirmer] Bloc ${blockHeight} : balances creditees avec succes`);
      } catch (err) {
        console.error(`[Confirmer] Erreur credit bloc ${blockHeight}:`, err);
      }
    }
  } catch (err) {
    console.error("[Confirmer] Erreur globale:", err);
  }

  if (confirmed > 0 || orphaned > 0) {
    console.log(`[Confirmer] Resultat: ${confirmed} confirme(s), ${orphaned} orphan(s)`);
  }

  return { confirmed, orphaned };
}

// Re-distribuer un bloc dont les block_rewards sont manquants
// (crash entre recordBlock et distributePPLNS/distributeSolo)
async function redistributeBlock(blockHeight: number): Promise<void> {
  // Recuperer les infos du bloc
  const blockResult = await database.query(
    "SELECT height, difficulty, finder_address, mining_mode FROM blocks WHERE height = $1",
    [blockHeight]
  );
  if (blockResult.rows.length === 0) {
    throw new Error("Bloc " + blockHeight + " introuvable en DB");
  }

  const block = blockResult.rows[0];
  const rewardNano = await ergoNode.getEmissionReward(blockHeight);

  console.log("[Confirmer] Re-distribution bloc " + blockHeight + " mode=" + block.mining_mode +
    " reward=" + (Number(rewardNano) / 1e9).toFixed(4) + " ERG");

  if (block.mining_mode === 'solo') {
    await distributeSolo(blockHeight, rewardNano, block.finder_address);
  } else {
    await distributePPLNS(blockHeight, rewardNano, parseFloat(block.difficulty));
  }
}
