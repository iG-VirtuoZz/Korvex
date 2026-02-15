# PPLNS - Pay Per Last N Shares

## What is PPLNS?

PPLNS is a **reward distribution** system among pool miners. Instead of paying for each share individually, it looks at the last N shares when a block is found.

## Why PPLNS?

### The "Pool Hopping" Problem

With a simple system (pay-per-share), clever miners can:
1. Join the pool when it's "lucky"
2. Leave when it's "unlucky"
3. Profit without taking any risk

### The PPLNS Solution

PPLNS rewards **loyalty**:
- It looks at shares within a **window** of time/difficulty
- Miners who stay longer are rewarded fairly
- Pool-hoppers lose their shares when they leave

## How Does It Work?

### The PPLNS Window

```
window = factor x networkDifficulty
```

- **factor**: pool parameter (KORVEX = 2)
- **networkDifficulty**: current network difficulty (~318T)

Example:
```
window = 2 x 318T = 636T of cumulative work
```

### When a Block is Found

1. The pool looks back through the shares
2. It accumulates `shareDiff` values until reaching the window size
3. Each miner receives a share proportional to their work

### Concrete Example

```
Block found! Reward = 6 ERG
PPLNS window = 636T

Shares within the window:
- Miner A: 400T of shareDiff (62.9%)
- Miner B: 200T of shareDiff (31.4%)
- Miner C:  36T of shareDiff (5.7%)

Distribution (after 1% fee):
- Pool fee: 0.06 ERG
- Miner A: 5.94 x 62.9% = 3.74 ERG
- Miner B: 5.94 x 31.4% = 1.87 ERG
- Miner C: 5.94 x 5.7%  = 0.34 ERG
```

## Calculation Based on shareDiff

### Why shareDiff and Not Share Count?

With **vardiff**, each share has a different difficulty:
- Small miner (high vardiff) -> many light shares
- Large miner (low vardiff) -> few heavy shares

If we just counted the number of shares, the small miner would be unfairly advantaged!

### The Fair Formula

```
miner_share = SUM(miner_shareDiff) / SUM(total_shareDiff)
```

Each share is weighted by its `shareDiff`. This reflects the actual work performed.

## The PPLNS Factor

### What Does It Change?

| Factor | Window | Effect |
|--------|--------|--------|
| 0.5 | Small | More variance, less loyalty |
| 1 | Medium | Balanced |
| 2 | Large | Less variance, more loyalty |
| 4 | Very large | Very smooth, very loyal |

**KORVEX uses factor = 2**: a good balance between stability and responsiveness.

### Illustration

```
Factor 0.5: Looking at the last ~30 minutes of work
Factor 2  : Looking at the last ~2 hours of work
Factor 4  : Looking at the last ~4 hours of work
```

## Credit Timing

### Step 1: Block Found

The PPLNS distribution is **calculated** and stored in `block_rewards`.
But balances are **not yet credited**!

### Step 2: Confirmation

After **720 confirmations** (~24h), the block is confirmed.
Balances are then credited from `block_rewards`.

### Why Wait?

If the block becomes orphaned, we don't want to have credited ERG that doesn't exist!

## Dashboard Visualization

On KORVEX, you can see:
- **Pending balance**: rewards waiting for confirmation
- **Balance**: confirmed rewards, ready to be paid
- **/api/blocks/:height/rewards**: detailed distribution for a block

## See Also

- [SOLO Mining](solo-mining.md) - The "all or nothing" alternative to PPLNS
- [Shares](shares.md) - Understanding shareDiff
- [Blocks and Rewards](../blockchain/blocks-rewards.md) - Confirmations
- [Wallet Management](../wallet/wallet-management.md) - Payments
