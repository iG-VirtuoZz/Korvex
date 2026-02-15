import { database } from "../db/database";
import { config } from "../config";

export async function distributeSolo(
  blockHeight: number,
  rewardNano: bigint,
  finderAddress: string
): Promise<void> {
  console.log("[SOLO] Distribution bloc " + blockHeight + " -> " + finderAddress.substring(0, 12) + "...");

  const feeNano = (rewardNano * BigInt(Math.round(config.solo.fee * 10000))) / BigInt(10000);
  const rewardNet = rewardNano - feeNano;

  const rewards = [
    { address: finderAddress, shareCount: 0, shareDiffSum: 0, amountNano: rewardNet },
  ];

  if (feeNano > BigInt(0) && config.pool.address) {
    rewards.push({ address: config.pool.address, shareCount: 0, shareDiffSum: 0, amountNano: feeNano });
  }

  await database.insertBlockRewardsAndUpdateBlock(blockHeight, rewards, rewardNano, 0, 0);

  console.log("[SOLO] " + (Number(rewardNet) / 1e9).toFixed(4) + " ERG -> " + finderAddress.substring(0, 12) + "... (fee: " + (Number(feeNano) / 1e9).toFixed(4) + " ERG)");
}
