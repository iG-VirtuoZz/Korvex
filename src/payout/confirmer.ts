import { config } from "../config";
import { database } from "../db/database";
import { ergoNode } from "../ergo/node";

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
