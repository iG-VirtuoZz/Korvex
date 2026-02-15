import { database } from "../db/database";
import { config } from "../config";

interface MinerReward {
  address: string;
  shareCount: number;
  shareDiffSum: number;
  amountNano: bigint;
}

export async function distributePPLNS(
  blockHeight: number,
  rewardNano: bigint,
  networkDifficulty: number
): Promise<void> {
  console.log("[PPLNS] Distribution pour le bloc " + blockHeight);
  console.log("[PPLNS] Reward: " + rewardNano + " nanoERG, Network diff: " + networkDifficulty);

  const windowDiff = config.pplns.factor * networkDifficulty;
  console.log("[PPLNS] Fenetre: " + config.pplns.factor + " * " + networkDifficulty + " = " + windowDiff);

  const shares = await database.getSharesForPPLNS(windowDiff);

  if (shares.length === 0) {
    console.log("[PPLNS] Aucun share dans la fenetre, distribution impossible");
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

  console.log("[PPLNS] " + shares.length + " shares, " + minerMap.size + " mineurs, totalDiffSum=" + totalDiffSum);

  const feeNano = (rewardNano * BigInt(Math.round(config.pool.fee * 10000))) / BigInt(10000);
  const rewardNet = rewardNano - feeNano;
  console.log("[PPLNS] Fee pool: " + feeNano + " nanoERG (" + (config.pool.fee * 100) + "%), Reward net: " + rewardNet + " nanoERG");

  const rewards: MinerReward[] = [];
  let distributed = BigInt(0);

  for (const [address, data] of minerMap) {
    const amountNano = (rewardNet * BigInt(Math.round(data.shareDiffSum * 1e8))) / BigInt(Math.round(totalDiffSum * 1e8));
    rewards.push({
      address,
      shareCount: data.shareCount,
      shareDiffSum: data.shareDiffSum,
      amountNano,
    });
    distributed += amountNano;
  }

  const remainder = rewardNet - distributed;
  if (remainder > BigInt(0) && rewards.length > 0) {
    rewards.sort((a, b) => b.shareDiffSum - a.shareDiffSum);
    rewards[0].amountNano += remainder;
    console.log("[PPLNS] Reste arrondi: " + remainder + " nanoERG -> " + rewards[0].address.substring(0, 12) + "...");
  }

  // Credit the fee to the pool address
  if (feeNano > BigInt(0) && config.pool.address) {
    rewards.push({
      address: config.pool.address,
      shareCount: 0,
      shareDiffSum: 0,
      amountNano: feeNano,
    });
    console.log("[PPLNS] Fee " + (Number(feeNano) / 1e9) + " ERG credite a " + config.pool.address.substring(0, 12) + "...");
  }

  // Save (atomic transaction)
  await database.insertBlockRewardsAndUpdateBlock(
    blockHeight,
    rewards,
    rewardNano,
    shares.length,
    totalDiffSum
  );

  console.log("[PPLNS] Distribution terminee pour bloc " + blockHeight);
  console.log("[PPLNS]   Fee pool: " + (Number(feeNano) / 1e9) + " ERG -> " + config.pool.address.substring(0, 12) + "...");
  for (const r of rewards) {
    if (r.address === config.pool.address) continue;
    const ergAmount = (Number(r.amountNano) / 1e9).toFixed(9);
    const pct = ((r.shareDiffSum / totalDiffSum) * 100).toFixed(2);
    console.log("[PPLNS]   " + r.address.substring(0, 12) + "... : " + ergAmount + " ERG (" + pct + "%, " + r.shareCount + " shares)");
  }
}
