# SOLO Mining - All or Nothing

## What is SOLO Mining?

In SOLO mining, when a miner finds a block, they receive **100% of the reward** (minus the pool fee). Other miners receive nothing for that block. It's "all or nothing".

It's the opposite of PPLNS where everyone shares. In SOLO, you take all the risk but also all the reward.

## PPLNS vs SOLO - Full Comparison

### 1. What is IDENTICAL (protocol and infrastructure)

| Component | PPLNS | SOLO | Identical? |
|-----------|-------|------|:----------:|
| Stratum Protocol | `mining.subscribe/authorize/notify/submit` | Identical | YES |
| Vardiff | 15s target adjustment | Identical | YES |
| Share validation (Autolykos2) | `validateShare()` | Identical | YES |
| Block submission to node | `submitSolution()` | Identical | YES |
| Mining software | lolMiner / TeamRedMiner | Identical | YES |
| Hashrate calculation | `SUM(share_diff) * 1.08 / time` | Identical | YES |
| Workers tracking | By `address.worker` | Identical | YES |
| Shares storage | `shares` table | Identical | YES |
| Confirmations | 720 blocks (~24h) | Identical | YES |
| Payment mechanism | balance -> grouped tx | Identical | YES |
| pk in the block | Pool's public key | Identical | YES |

**In summary**: the miner uses the **same software**, the **same configuration**, the **same protocol**. The only visible difference is the **connection port** (e.g., 3416 PPLNS, 3417 SOLO).

### 2. What is DIFFERENT (distribution and metrics)

| Component | PPLNS | SOLO | Identical? |
|-----------|-------|------|:----------:|
| Shares -> payment | Proportional within PPLNS window | NOT USED (shares don't contribute to payout) | NO |
| Reward distribution | Shared among N miners (PPLNS window) | 100% to the finder - fee | NO |
| Pool fee | 1% | 1.5% | NO |
| Effort calculation | Work of the ENTIRE pool vs network diff | Work of THIS MINER alone vs network diff | NO |
| Blocks displayed | Pool blocks | THIS miner's blocks only | NO |
| Payment frequency | Each pool block (frequent, small amounts) | Each miner's block (rare, large amount) | NO |
| Estimated time for a block | Entire pool (fast) | Per miner (much longer) | NEW |
| Personal miner effort | Not displayed | `% personal effort vs network` | NEW |

## How Does It Work in Korvex?

### The Complete Flow

```
1. The miner connects via Stratum on the SOLO port (3417)
   -> The pool assigns miningMode = "solo" to their session

2. The miner submits shares normally
   -> Stored in the shares table with mining_mode = "solo"
   -> Used for hashrate and effort calculation (not for payment)

3. A share turns out to be a valid block!
   -> The pool identifies the winner via session.address
   -> Instead of calling distributePPLNS(), it calls distributeSolo()

4. SOLO distribution:
   -> Total reward: 3 ERG
   -> Pool fee (1.5%): 0.045 ERG
   -> Credit to the winning miner: 2.955 ERG

5. Waiting for 720 confirmations (~24h)
   -> After confirmation, the balance is credited
   -> Automatic payment when balance >= threshold
```

### Why is the Pool an Intermediary?

The Ergo node generates the block candidate with **its own public key** (the one configured in `ergo.conf`). It's the node that decides which address receives the on-chain reward.

```
Ergo Node  -> generates candidate with pk = pool's key
Miner      -> solves the puzzle
Mined block -> reward goes to the POOL's address (not the miner's)
Pool       -> waits 720 blocks, then sends reward - fee to the winning miner
```

This is the same in both PPLNS and SOLO. The only difference is **who** the pool sends the ERG to after maturation.

### Winner Identification

When a block is found, the pool knows **immediately** who found it thanks to the TCP session:

```typescript
if (result.meetsNetworkTarget) {
    // session.address = winning miner's Ergo address
    // session.worker = worker name
    console.log("BLOCK FOUND by " + session.address + "." + session.worker);
}
```

Each miner has their own persistent TCP connection with the pool. The address and worker are registered during `mining.authorize`.

## Concrete Example: PPLNS vs SOLO

### Scenario

```
Network hashrate: 30 TH/s
Pool hashrate   : 2 GH/s (PPLNS) + 500 MH/s (SOLO)
Average time between network blocks: ~2 minutes
Reward per block: 3 ERG
```

### In PPLNS (2 GH/s pool)

```
Network share     = 2,000 GH/s / 30,000 GH/s = 6.67%
Blocks per day    = 720 * 6.67% = ~48 blocks/day
Pool reward/day   = 48 * 3 ERG = ~144 ERG/day

Miner with 200 MH/s (10% of the pool):
-> Earnings/day = 144 * 10% * 0.99 (fee) = ~14.3 ERG/day
-> Regular payments, small amounts
```

### In SOLO (200 MH/s miner)

```
Network share          = 200 MH/s / 30,000 GH/s = 0.00067%
Blocks per day         = 720 * 0.00067% = ~0.0048
Average time per block = 1 / 0.0048 = ~208 days

When they find a block:
-> Earnings = 3 ERG * 0.985 (1.5% fee) = 2.955 ERG
-> But on average, they wait ~208 days between each block!
```

### Earnings Comparison

| Period | PPLNS (200 MH/s) | SOLO (200 MH/s) |
|--------|-------------------|------------------|
| 1 day | ~14.3 ERG | 0 ERG (most likely) |
| 1 week | ~100 ERG | 0 ERG (most likely) |
| 1 month | ~429 ERG | Maybe 1 block (2.955 ERG) or 0 |
| 6 months | ~2,574 ERG | Maybe 1 block (2.955 ERG) |
| 1 year | ~5,220 ERG | ~1.75 blocks = ~5.17 ERG |

**Conclusion**: over the long term, earnings are nearly identical (in theory). The difference is **variance**: PPLNS = regular income, SOLO = long wait then large payout.

## Who is SOLO For?

### SOLO is suited for:
- **Large miners** (several GH/s) who find blocks regularly
- **Gamblers** who enjoy the "all or nothing" aspect
- **Patient miners** who prefer keeping 100% of the reward

### SOLO is NOT suited for:
- **Small miners** (a few hundred MH/s) -> too long between blocks
- **Miners who want regular income** -> PPLNS is better
- **Beginners** -> PPLNS is easier to understand

### Practical Threshold

Generally, SOLO becomes interesting when a miner can expect to find a block **at least once per week**:

```
Average time < 7 days
-> miner_hashrate > network_hashrate / (720 * 7)
-> miner_hashrate > 30 TH/s / 5040
-> miner_hashrate > ~6 GH/s (for Ergo currently)
```

With less than 6 GH/s, SOLO is possible but **very unpredictable**.

## Frontend Stats - What to Display

### Pool Dashboard (Home)

| Stat | PPLNS | SOLO | Action |
|------|-------|------|--------|
| Pool hashrate | Displayed | Displayed separately (SOLO pool hashrate) | Separate by mode |
| Miners Online | Displayed | Displayed separately | Separate by mode |
| Pool effort | % collective effort | Hide (not relevant in SOLO) | Hide in SOLO |
| Blocks found | Pool blocks | SOLO blocks (with finder info) | Filter by mode |
| Last Block | Last pool block | Last SOLO block | Separate by mode |

### Miner Page (MinerPage)

| Stat | PPLNS | SOLO | Action |
|------|-------|------|--------|
| Hashrate (15m, 1h, 24h) | Displayed | Displayed | Identical |
| Workers (list, status) | Displayed | Displayed | Identical |
| Valid/invalid shares | Displayed | Displayed | Identical |
| Miner effort | Not displayed | `% personal effort` | NEW in SOLO |
| Estimated time | Not displayed | "~X days per block" | NEW in SOLO |
| PPLNS Window | Displayed | Hide (no window) | Hide in SOLO |
| Blocks found | Pool blocks | My blocks (finder = me) | Filter by miner |
| Payments | Frequent, small | Rare, large | Identical display |
| Reward per block | Proportional share | Full reward - fee | Rename |

### Formulas for New SOLO Metrics

**Per-miner effort**:
```
miner_effort = SUM(miner's shares since their last block) / network_difficulty * 100
```

**Estimated time to find a block**:
```
estimated_time = (network_hashrate / miner_hashrate) * avg_network_block_time
              = (30 TH/s / 200 MH/s) * 2 minutes
              = 150,000 * 2 min
              = ~208 days
```

## Technical Implementation (Summary)

### Required Backend Changes

| File | Modification |
|------|-------------|
| `server.ts` | `miningMode` attribute per session (based on connection port) |
| `server.ts` (handleSubmit) | If block -> call `distributePPLNS()` or `distributeSolo()` based on mode |
| **`solo.ts`** (new) | Credits 100% of reward (- fee) to `session.address` |
| `config.ts` | New SOLO port (e.g., 3417), SOLO fee (1.5%) |
| DB migrations | `mining_mode` column on `shares`, `blocks`, `balances` tables |
| `api.ts` | Endpoints filtered by mode, new SOLO metrics |

### Required Frontend Changes

| File | Modification |
|------|-------------|
| `LandingPage.tsx` | SOLO tab -> route `/coin/ergo-solo` when active |
| `Home.tsx` | SOLO variant: miner effort, estimated time, miner's blocks |
| `MinerPage.tsx` | Personal effort, estimated time, miner's blocks |
| `coins.ts` | `solo` mode set to `active: true` with route |
| `api.ts` (frontend) | `?mode=solo` parameters on API calls |

### What Does NOT Change

- Stratum protocol (same code)
- `autolykos2.ts` (identical validation)
- Ergo node and its configuration
- Confirmation mechanism (720 blocks)
- Payment system (balance -> tx)

## See Also

- [PPLNS](pplns.md) - How the current PPLNS mode works
- [Shares](shares.md) - Understanding shareDiff and validation
- [Stratum Protocol](stratum-protocol.md) - Identical in PPLNS and SOLO
- [Blocks and Rewards](../blockchain/blocks-rewards.md) - Confirmations and maturation
