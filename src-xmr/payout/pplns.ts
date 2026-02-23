import { xmrDatabase } from "../db/database";
import { xmrConfig } from "../config";

// Distribution PPLNS pour Monero
// Meme logique que Ergo, mais montants en piconero (1 XMR = 10^12 piconero)

interface MinerReward {
  address: string;
  shareCount: number;
  shareDiffSum: number;
  amountPico: bigint;
}

export async function distributeXmrPPLNS(
  blockHeight: number,
  rewardPico: bigint,
  networkDifficulty: number
): Promise<void> {
  console.log("[XMR PPLNS] Distribution pour le bloc " + blockHeight);
  console.log("[XMR PPLNS] Reward: " + rewardPico + " piconero (" + (Number(rewardPico) / 1e12).toFixed(6) + " XMR), Network diff: " + networkDifficulty);

  const windowDiff = xmrConfig.pplns.factor * networkDifficulty;
  console.log("[XMR PPLNS] Fenetre: " + xmrConfig.pplns.factor + " * " + networkDifficulty + " = " + windowDiff);

  const shares = await xmrDatabase.getSharesForPPLNS(windowDiff);

  if (shares.length === 0) {
    console.log("[XMR PPLNS] Aucun share dans la fenetre, distribution impossible");
    return;
  }

  const minerMap = new Map<string, { shareCount: number; shareDiffSum: number }>();
  let totalDiffSum = 0;

  for (const share of shares) {
    const existing = minerMap.get(share.address) || { shareCount: 0, shareDiffSum: 0 };
    existing.shareCount += 1;
    existing.shareDiffSum += share.share_diff;
    minerMap.set(share.address, existing);
    totalDiffSum += share.share_diff;
  }

  console.log("[XMR PPLNS] " + shares.length + " shares, " + minerMap.size + " mineurs, totalDiffSum=" + totalDiffSum);

  const feePico = (rewardPico * BigInt(Math.round(xmrConfig.pool.fee * 10000))) / BigInt(10000);
  const rewardNet = rewardPico - feePico;
  console.log("[XMR PPLNS] Fee pool: " + feePico + " piconero (" + (xmrConfig.pool.fee * 100) + "%), Reward net: " + rewardNet + " piconero");

  const rewards: MinerReward[] = [];
  let distributed = BigInt(0);

  for (const [address, data] of minerMap) {
    const amountPico = (rewardNet * BigInt(Math.round(data.shareDiffSum * 1e8))) / BigInt(Math.round(totalDiffSum * 1e8));
    rewards.push({
      address,
      shareCount: data.shareCount,
      shareDiffSum: data.shareDiffSum,
      amountPico,
    });
    distributed += amountPico;
  }

  // Reste d'arrondi au plus gros mineur
  const remainder = rewardNet - distributed;
  if (remainder > BigInt(0) && rewards.length > 0) {
    rewards.sort((a, b) => b.shareDiffSum - a.shareDiffSum);
    rewards[0].amountPico += remainder;
    console.log("[XMR PPLNS] Reste arrondi: " + remainder + " piconero -> " + rewards[0].address.substring(0, 12) + "...");
  }

  // Crediter le fee a l adresse de la pool
  if (feePico > BigInt(0) && xmrConfig.pool.address) {
    rewards.push({
      address: xmrConfig.pool.address,
      shareCount: 0,
      shareDiffSum: 0,
      amountPico: feePico,
    });
    console.log("[XMR PPLNS] Fee " + (Number(feePico) / 1e12).toFixed(6) + " XMR credite a " + xmrConfig.pool.address.substring(0, 12) + "...");
  }

  // Sauvegarder (transaction atomique)
  await xmrDatabase.insertBlockRewardsAndUpdateBlock(
    blockHeight,
    rewards,
    rewardPico,
    shares.length,
    totalDiffSum
  );

  console.log("[XMR PPLNS] Distribution terminee pour bloc " + blockHeight);
  for (const r of rewards) {
    if (r.address === xmrConfig.pool.address) continue;
    const xmrAmount = (Number(r.amountPico) / 1e12).toFixed(6);
    const pct = ((r.shareDiffSum / totalDiffSum) * 100).toFixed(2);
    console.log("[XMR PPLNS]   " + r.address.substring(0, 12) + "... : " + xmrAmount + " XMR (" + pct + "%, " + r.shareCount + " shares)");
  }
}
