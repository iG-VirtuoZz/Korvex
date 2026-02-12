import { config } from "../config";
import { database } from "../db/database";

interface PayableEntry {
  address: string;
  amount: bigint;
}

export async function runPayer(): Promise<{ sent: number; failed: number; unknown: number }> {
  let sent = 0;
  let failed = 0;
  let unknown = 0;

  if (!config.payout.walletPass) {
    return { sent: 0, failed: 0, unknown: 0 };
  }

  try {
    // Verifier s'il y a des payments 'unknown' non resolus
    // Si oui, bloquer les paiements auto pour eviter tout doublon
    const hasUnresolved = await database.hasUnresolvedPayments();
    if (hasUnresolved) {
      console.warn("[Payer] !!! Payments 'unknown' non resolus detectes — paiements bloques. Intervention manuelle requise !!!");
      return { sent: 0, failed: 0, unknown: 0 };
    }

    // Exclure l'adresse de la pool : la fee reste dans le wallet, pas besoin de s'auto-payer
    const payables = await database.getPayableBalances(config.pool.minPayoutNano, config.pool.address || undefined);

    if (payables.length === 0) {
      return { sent: 0, failed: 0, unknown: 0 };
    }

    console.log("[Payer] " + payables.length + " mineur(s) eligible(s) au paiement");

    // Decouper en batches
    const batches: PayableEntry[][] = [];
    for (let i = 0; i < payables.length; i += config.payout.maxPerBatch) {
      batches.push(payables.slice(i, i + config.payout.maxPerBatch));
    }

    const unlocked = await unlockWallet();
    if (!unlocked) {
      console.error("[Payer] Impossible de deverrouiller le wallet");
      return { sent: 0, failed: payables.length, unknown: 0 };
    }

    for (const batch of batches) {
      const result = await sendBatchSafe(batch);
      sent += result.sent;
      failed += result.failed;
      unknown += result.unknown;

      // Si un batch est en 'unknown', arreter immediatement
      if (result.unknown > 0) {
        console.error("[Payer] Batch en status 'unknown', arret des paiements pour ce cycle");
        break;
      }
    }

    await lockWallet();

  } catch (err) {
    console.error("[Payer] Erreur globale:", err);
    try { await lockWallet(); } catch (lockErr) {
      console.error("[Payer] Erreur relock apres erreur:", lockErr);
    }
  }

  if (sent > 0 || failed > 0 || unknown > 0) {
    console.log("[Payer] Resultat: " + sent + " envoye(s), " + failed + " echoue(s), " + unknown + " unknown(s)");
  }

  // Nettoyage auto : garder max 5 failed par adresse + supprimer vieilles shares
  try {
    const cleaned = await database.cleanOldFailedPayments();
    if (cleaned > 0) console.log("[Payer] Nettoyage: " + cleaned + " ancien(s) paiement(s) failed supprime(s)");
    const sharesDeleted = await database.cleanOldShares();
    if (sharesDeleted > 0) console.log("[Payer] Nettoyage: " + sharesDeleted + " share(s) > 7 jours supprimee(s)");
  } catch (err) {
    console.error("[Payer] Erreur nettoyage auto:", err);
  }

  return { sent, failed, unknown };
}

async function sendBatchSafe(batch: PayableEntry[]): Promise<{ sent: number; failed: number; unknown: number }> {
  // ============================================
  // PHASE 1 : Preparer en DB (atomique)
  // Debite les balances + cree payments en 'pending'
  // Retourne les payments crees avec adresse + montant (pas juste les IDs)
  // pour eviter tout decalage si des entries sont skip
  // ============================================
  let prepared: Array<{ id: number; address: string; amount: bigint }>;
  try {
    prepared = await database.prepareBatchPayments(batch);
  } catch (err) {
    console.error("[Payer] Erreur preparation batch DB:", err);
    return { sent: 0, failed: batch.length, unknown: 0 };
  }

  if (prepared.length === 0) {
    console.log("[Payer] Aucun payment prepare (soldes insuffisants)");
    return { sent: 0, failed: 0, unknown: 0 };
  }

  const paymentIds = prepared.map((p) => p.id);

  // Construire le payload directement depuis les payments prepares
  // Chaque entry contient l'adresse et le montant exact qui a ete debite
  const requests = prepared.map((p) => ({
    address: p.address,
    value: Number(p.amount),
  }));

  // L'API Ergo /wallet/payment/send attend un ARRAY de PaymentRequest
  // Format : [{ address, value }, ...] — PAS un objet { requests, fee }
  const payload = requests;

  const totalErg = prepared.reduce((sum, p) => sum + Number(p.amount), 0) / 1e9;
  console.log("[Payer] Envoi batch: " + prepared.length + " destinataire(s), total " + totalErg.toFixed(4) + " ERG");

  // ============================================
  // PHASE 2 : UN SEUL POST, JAMAIS DE RETRY
  // ============================================
  try {
    const res = await fetch(config.ergoNode.url + "/wallet/payment/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api_key": config.ergoNode.apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      const errorMsg = "HTTP " + res.status + ": " + errorText;
      console.error("[Payer] Erreur send (HTTP non-OK): " + errorMsg);

      // HTTP error = le noeud a repondu, on sait que la tx N'A PAS ete broadcastee
      // On peut marquer comme 'failed' et re-crediter les balances
      await refundAndFailBatch(paymentIds, errorMsg);
      return { sent: 0, failed: paymentIds.length, unknown: 0 };
    }

    // Succes : recuperer txHash
    const txId = await res.json();
    const txHash = typeof txId === "string" ? txId : (txId as any).id || JSON.stringify(txId);

    console.log("[Payer] Transaction envoyee: " + txHash);

    // Finaliser en DB : status 'pending' -> 'sent'
    await database.finalizeBatchPayments(paymentIds, txHash);

    console.log("[Payer] Batch OK: " + paymentIds.length + " paiement(s), tx " + txHash);
    return { sent: paymentIds.length, failed: 0, unknown: 0 };

  } catch (err: any) {
    // Timeout / erreur reseau = ON NE SAIT PAS si la tx a ete broadcastee
    // JAMAIS de retry, marquer comme 'unknown'
    const errorMsg = err?.message || String(err);
    console.error("[Payer] !!! ERREUR SEND (timeout/reseau) : " + errorMsg);
    console.error("[Payer] !!! Payments marques 'unknown' — INTERVENTION MANUELLE REQUISE !!!");
    console.error("[Payer] !!! Payment IDs: " + paymentIds.join(", ") + " !!!");

    await database.markBatchPaymentsUnknown(paymentIds, errorMsg);
    return { sent: 0, failed: 0, unknown: paymentIds.length };
  }
}

// Re-crediter les balances et marquer les payments en 'failed'
// Utilise uniquement quand on est SUR que la tx n'a pas ete broadcastee (erreur HTTP)
async function refundAndFailBatch(paymentIds: number[], errorMsg: string): Promise<void> {
  try {
    // Recuperer les payments pour connaitre les montants
    const result = await database.query(
      "SELECT id, address, amount_nano FROM payments WHERE id = ANY($1) AND status = 'pending'",
      [paymentIds]
    );

    const client = await database.getClient();
    try {
      await client.query("BEGIN");

      for (const row of result.rows) {
        // Re-crediter la balance
        await client.query(
          "UPDATE balances SET amount = amount + $1 WHERE address = $2",
          [row.amount_nano, row.address]
        );

        // Marquer le payment comme 'failed'
        await client.query(
          "UPDATE payments SET status = 'failed', error_msg = $1 WHERE id = $2",
          [errorMsg, row.id]
        );
      }

      await client.query("COMMIT");
      console.log("[Payer] Batch refund OK: " + result.rows.length + " balance(s) re-creditee(s)");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[Payer] Erreur refund batch:", err);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("[Payer] Erreur recuperation payments pour refund:", err);
  }
}

export async function unlockWallet(): Promise<boolean> {
  try {
    const res = await fetch(config.ergoNode.url + "/wallet/unlock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api_key": config.ergoNode.apiKey,
      },
      body: JSON.stringify({ pass: config.payout.walletPass }),
    });

    if (res.ok) {
      console.log("[Payer] Wallet deverrouille");
      return true;
    }

    const text = await res.text();
    if (text.includes("already unlocked")) {
      console.log("[Payer] Wallet deja deverrouille");
      return true;
    }

    console.error("[Payer] Erreur unlock wallet:", text);
    return false;
  } catch (err) {
    console.error("[Payer] Erreur unlock wallet:", err);
    return false;
  }
}

export async function lockWallet(): Promise<void> {
  try {
    await fetch(config.ergoNode.url + "/wallet/lock", {
      method: "GET",
      headers: { "api_key": config.ergoNode.apiKey },
    });
    console.log("[Payer] Wallet verrouille");
  } catch (err) {
    console.error("[Payer] Erreur lock wallet:", err);
  }
}
