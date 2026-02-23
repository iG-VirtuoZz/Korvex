import { xmrConfig } from "../config";
import { xmrDatabase } from "../db/database";
import { wallet } from "../monero/wallet";

// Paiements Monero via monero-wallet-rpc transfer_split
// Max 16 outputs par transaction
// Montants en piconero (1 XMR = 10^12 piconero)

interface PayableEntry {
  address: string;
  amount: bigint;
}

export async function runXmrPayer(): Promise<{ sent: number; failed: number; unknown: number }> {
  let sent = 0;
  let failed = 0;
  let unknown = 0;

  try {
    // Verifier s'il y a des payments 'unknown' non resolus
    const hasUnresolved = await xmrDatabase.hasUnresolvedPayments();
    if (hasUnresolved) {
      console.warn("[XMR Payer] !!! Payments 'unknown' non resolus — paiements bloques. Intervention manuelle requise !!!");
      return { sent: 0, failed: 0, unknown: 0 };
    }

    // Exclure l'adresse de la pool
    const payables = await xmrDatabase.getPayableBalances(xmrConfig.pool.minPayoutPico, xmrConfig.pool.address || undefined);

    if (payables.length === 0) {
      return { sent: 0, failed: 0, unknown: 0 };
    }

    console.log("[XMR Payer] " + payables.length + " mineur(s) eligible(s) au paiement");

    // Decouper en batches de 16 (max outputs Monero)
    const batches: PayableEntry[][] = [];
    for (let i = 0; i < payables.length; i += xmrConfig.payout.maxPerBatch) {
      batches.push(payables.slice(i, i + xmrConfig.payout.maxPerBatch));
    }

    // Pas besoin de unlock/lock wallet : monero-wallet-rpc gere ca via --disable-rpc-login
    // Le wallet est bind sur localhost uniquement

    for (const batch of batches) {
      const result = await sendBatchSafe(batch);
      sent += result.sent;
      failed += result.failed;
      unknown += result.unknown;

      if (result.unknown > 0) {
        console.error("[XMR Payer] Batch en status 'unknown', arret des paiements pour ce cycle");
        break;
      }
    }
  } catch (err) {
    console.error("[XMR Payer] Erreur globale:", err);
  }

  if (sent > 0 || failed > 0 || unknown > 0) {
    console.log("[XMR Payer] Resultat: " + sent + " envoye(s), " + failed + " echoue(s), " + unknown + " unknown(s)");
  }

  // Nettoyage auto
  try {
    const cleaned = await xmrDatabase.cleanOldFailedPayments();
    if (cleaned > 0) console.log("[XMR Payer] Nettoyage: " + cleaned + " ancien(s) paiement(s) failed supprime(s)");
    const sharesDeleted = await xmrDatabase.cleanOldShares();
    if (sharesDeleted > 0) console.log("[XMR Payer] Nettoyage: " + sharesDeleted + " share(s) > 7 jours supprimee(s)");
  } catch (err) {
    console.error("[XMR Payer] Erreur nettoyage auto:", err);
  }

  return { sent, failed, unknown };
}

async function sendBatchSafe(batch: PayableEntry[]): Promise<{ sent: number; failed: number; unknown: number }> {
  // PHASE 1 : Preparer en DB (atomique)
  let prepared: Array<{ id: number; address: string; amount: bigint }>;
  try {
    prepared = await xmrDatabase.prepareBatchPayments(batch);
  } catch (err) {
    console.error("[XMR Payer] Erreur preparation batch DB:", err);
    return { sent: 0, failed: batch.length, unknown: 0 };
  }

  if (prepared.length === 0) {
    console.log("[XMR Payer] Aucun payment prepare (soldes insuffisants)");
    return { sent: 0, failed: 0, unknown: 0 };
  }

  const paymentIds = prepared.map((p) => p.id);

  // Construire les destinations pour transfer_split
  const destinations = prepared.map((p) => ({
    amount: Number(p.amount), // piconero (entier)
    address: p.address,
  }));

  const totalXmr = prepared.reduce((sum, p) => sum + Number(p.amount), 0) / 1e12;
  console.log("[XMR Payer] Envoi batch: " + prepared.length + " destinataire(s), total " + totalXmr.toFixed(6) + " XMR");

  // PHASE 2 : UN SEUL APPEL, JAMAIS DE RETRY
  try {
    const result = await wallet.transferSplit(destinations);
    const txHash = result.tx_hash || result.tx_hash_list?.[0] || "";

    if (!txHash) {
      throw new Error("Pas de tx_hash dans la reponse");
    }

    console.log("[XMR Payer] Transaction envoyee: " + txHash + " (fee: " + (result.fee / 1e12).toFixed(6) + " XMR)");

    // Finaliser en DB
    await xmrDatabase.finalizeBatchPayments(paymentIds, txHash);

    console.log("[XMR Payer] Batch OK: " + paymentIds.length + " paiement(s), tx " + txHash);
    return { sent: paymentIds.length, failed: 0, unknown: 0 };

  } catch (err: any) {
    const errorMsg = err?.message || String(err);

    // Detecter si c'est une erreur wallet (on sait que la tx n'a pas ete envoyee)
    // ou une erreur reseau/timeout (on ne sait pas)
    if (errorMsg.includes("Wallet RPC error") || errorMsg.includes("not enough money") ||
        errorMsg.includes("WALLET_RPC_ERROR") || errorMsg.includes("tx not possible")) {
      console.error("[XMR Payer] Erreur wallet (tx non envoyee): " + errorMsg);
      await refundAndFailBatch(paymentIds, errorMsg);
      return { sent: 0, failed: paymentIds.length, unknown: 0 };
    }

    // Timeout / erreur reseau = ON NE SAIT PAS
    console.error("[XMR Payer] !!! ERREUR SEND (timeout/reseau) : " + errorMsg);
    console.error("[XMR Payer] !!! Payments marques 'unknown' — INTERVENTION MANUELLE REQUISE !!!");
    console.error("[XMR Payer] !!! Payment IDs: " + paymentIds.join(", ") + " !!!");

    await xmrDatabase.markBatchPaymentsUnknown(paymentIds, errorMsg);
    return { sent: 0, failed: 0, unknown: paymentIds.length };
  }
}

// Re-crediter les balances et marquer les payments en 'failed'
async function refundAndFailBatch(paymentIds: number[], errorMsg: string): Promise<void> {
  try {
    const result = await xmrDatabase.query(
      "SELECT id, address, amount_pico FROM xmr_payments WHERE id = ANY($1) AND status = 'pending'",
      [paymentIds]
    );

    const client = await xmrDatabase.getClient();
    try {
      await client.query("BEGIN");

      for (const row of result.rows) {
        await client.query(
          "UPDATE xmr_balances SET amount = amount + $1 WHERE address = $2",
          [row.amount_pico, row.address]
        );
        await client.query(
          "UPDATE xmr_payments SET status = 'failed', error_msg = $1 WHERE id = $2",
          [errorMsg, row.id]
        );
      }

      await client.query("COMMIT");
      console.log("[XMR Payer] Batch refund OK: " + result.rows.length + " balance(s) re-creditee(s)");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[XMR Payer] Erreur refund batch:", err);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[XMR Payer] Erreur recuperation payments pour refund:", err);
  }
}
