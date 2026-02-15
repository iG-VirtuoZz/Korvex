# KORVEX Pool Internals

> A visual table-based guide to understanding how the pool works, including a changelog of parameter changes.

---

## 1. The Journey of a Share (from A to Z)

What happens when a GPU finds a hash and sends it to the pool:

| Step | Who | What | Result |
|------|-----|------|--------|
| 1 | **GPU** | Computes billions of hashes per second | Finds a hash < bShare |
| 2 | **Miner** (lolMiner/TRM) | Sends `mining.submit` with the nonce | TCP message to the pool |
| 3 | **Pool (Stratum)** | Recomputes the Autolykos2 hash | Verifies the hash is correct |
| 4 | **Pool (Stratum)** | Compares hash vs `bShare` | Share valid or invalid |
| 5 | **Pool (Stratum)** | Compares hash vs `bNetwork` | If < bNetwork = BLOCK! |
| 6 | **Pool (DB)** | Records the share in PostgreSQL | `shareDiff` = proven work |
| 7 | **Pool (Vardiff)** | Updates the timestamp buffer | Will be used at next retarget |

### If a BLOCK is Found (step 5)

| Step | What | Detail |
|------|------|--------|
| 5a | Submit to the Ergo node | The solution is sent to the node |
| 5b | Discord alert | Webhook sends a message |
| 5c | Effort calculation | `effort = totalShareDiff / networkDiff * 100%` |
| 5d | Wait for blockId | Up to 5 attempts, 2s interval |
| 5e | Record the block | In the `blocks` table in PostgreSQL |
| 5f | PPLNS distribution | Distribute the reward among miners |

---

## 2. How a Block is Found (the Dice Analogy)

### The principle: a die with 1 billion faces

Imagine a die with **1 billion faces**. Your GPUs roll this die millions of times per second.

| Who decides | Rule | Difficulty |
|-------------|------|------------|
| The **Ergo network** | "For a block, you must roll **less than 5**" | Nearly impossible (1 in 200 million chance) |
| The **pool** | "For a share, you must roll **less than 50,000**" | Hard but doable (1 in 20,000 chance) |

### What Happens on Each Roll

```
GPU rolls the die millions of times per second...

  Result: 8,392,571    -> Too high, discard (GPU says nothing)
  Result: 2,458,103    -> Too high, discard
  Result: 38,421       -> It's < 50,000!
     Pool: "Valid share!"
     Pool: "Is it < 5? NO -> not a block, keep going"

  ... millions of rolls later ...

  Result: 3            -> It's < 50,000 AND < 5!
     Pool: "Valid share!"
     Pool: "Is it < 5? YES -> BLOCK FOUND!!!"
     Pool: -> submits the solution to the Ergo network
```

> **Key point**: a share and a block are the SAME computation. The only difference is the threshold. A block is simply a share that got VERY lucky.

### Visually: Where Does the Hash Land?

```
0          bNetwork                    bShare                              MAX
|              |                         |                                  |
|==============|=========================|                                  |
|              |                         |                                  |
|  hash here?  |    hash here?           |       hash here?                 |
|  = BLOCK!!!  |    = Valid share        |       = Miss (discard)           |
|  (ultra rare)|    (every ~15s)         |       (the vast majority)        |
```

The larger `bShare` is (= higher vardiff), the wider the "valid share" zone, the easier it is to find a share.
But `bNetwork` doesn't move (the network decides it), so finding a block remains equally hard.

### The Key Formula

```
bShare = bNetwork x vardiff
```

| Target | Value (example) | What it is |
|--------|-----------------|------------|
| `bNetwork` | 1,000,000 | The network threshold (fixed, very small = very hard) |
| `vardiff` | 50,000 | The multiplier chosen by the pool for this worker |
| `bShare` | 1,000,000 x 50,000 = 50 billion | The worker's threshold (much larger = easier) |

A hash has **50,000x more chances** of being < bShare than < bNetwork.
So for every ~50,000 valid shares, **only 1** would have also been a block (statistically).

### With Our Real Numbers

| Rig | Vardiff | Shares per block (theoretical) | Shares/min | Estimated time (this rig alone) |
|-----|---------|-------------------------------|------------|--------------------------------|
| Rig_4070x8 | ~53,000 | ~53,000 shares | ~4 | ~9.2 days |
| Rig_4070Super (NVIDIA) | ~43,000 | ~43,000 shares | ~4 | ~7.5 days |
| Rig_4070Super (AMD) | ~135,000 | ~135,000 shares | ~4 | ~23.4 days |
| Rig_Test | ~12,000 | ~12,000 shares | ~4 | ~2.1 days |
| **All together** | - | - | **~16** | **~1.5 days** |

> Each rig rolls its own die. The more GPUs we have, the more often we roll, the better our chances of landing on a number < bNetwork.

### Why is it Completely Random?

| Common Misconception | Reality |
|----------------------|---------|
| "We're getting closer to finding a block" | NO. Each hash is independent, there is no "progress" |
| "If we've been mining for a long time, the next block is due soon" | NO. This is the gambler's fallacy |
| "The hashrate guarantees a block within X days" | NO. It's a statistical average, not a guarantee |

It's **exactly** like the lottery:
- Buying more tickets (= more hashrate) increases your **chances per draw**
- But you might win on the 1st ticket or the 100,000th
- Having lost 99,999 times doesn't make the 100,000th ticket luckier

---

## 3. Security: Why You Can't Cheat

### The idea: "If I lower my vardiff, I get more shares, so more rewards?"

NO. Here's why:

### The Weight of Each Share Changes!

```
shareDiff = networkDiff / vardiff
```

| Scenario | Vardiff | Shares/sec | shareDiff (weight) | Total work/sec |
|----------|---------|------------|-------------------|----------------|
| Normal | 50,000 | 0.07 | 6.2 G | **0.43 G** |
| "Cheat" | 1 | 3,500 | 0.000124 G | **0.43 G** |

The total work per second is **identical**! With a low vardiff, you have lots of shares but each one "weighs" almost nothing. It's like cutting a pizza into 1,000 slices instead of 8: you have more slices, but the total amount of pizza hasn't changed.

### And for Finding a Block?

A block is found when the hash < `bNetwork`. This does **NOT** depend on vardiff.

```
bShare = bNetwork x vardiff
```

| Vardiff | bShare | Easier to find a share? | Easier to find a block? |
|---------|--------|------------------------|------------------------|
| 50,000 | bNetwork x 50,000 | Yes (1 share / 15s) | **NO** - bNetwork hasn't changed |
| 1 | bNetwork x 1 | No (very rare) | **NO** - bNetwork hasn't changed |
| 500,000 | bNetwork x 500,000 | Yes (many) | **NO** - bNetwork hasn't changed |

Vardiff only decides **how frequently** the miner shows its work to the pool. But the GPU rolls exactly the same number of dice per second regardless of vardiff. And the block is found when the die lands on < 5, whether you asked to see results < 50,000 or < 50 billion.

### The Only Way to Increase Your Chances?

**Having more hashrate** (= rolling the die more often). There is no mathematical shortcut. This is why mining consumes so much electricity - it's pure brute force.

### All Imaginable "Cheats" and Why They Fail

| Imagined "Cheat" | What happens | Protection |
|-------------------|--------------|------------|
| Lower the vardiff | Shares weigh less, total work identical | `shareDiff = netDiff / vardiff` |
| Send fake shares | The pool recomputes the Autolykos2 hash | -> `Low difficulty share` -> rejected |
| Send the same hash twice | The nonce is already in the Set | -> `Duplicate share` -> rejected |
| Modify the nonce | The recomputed hash won't be < bShare | -> `Low difficulty share` -> rejected |
| Claim to have found a block | The Ergo node recomputes everything | -> Block rejected by the network |
| Flood with invalid shares | Per-IP counter, ban after 50 | -> `Too many invalid shares, banned` |

> Each layer verifies the previous one. The GPU proves its work through math, the pool verifies the math, the Ergo node re-verifies the math. That's the beauty of **Proof of Work**: you can't lie to mathematics.

---

## 4. Vardiff - How the Pool Adjusts Difficulty

### Principle

Vardiff (variable difficulty) adjusts each worker's difficulty so that they send **1 share every ~15 seconds**.

| Worker | Hashrate | Ideal Vardiff | Shares/min | Why |
|--------|----------|---------------|------------|-----|
| 1x RTX 4070 | ~126 MH/s | ~40,000 | ~4 | Standard |
| 8x RTX 4070 | ~1010 MH/s | ~315,000 | ~4 | Vardiff 8x higher |
| 1x Vega 56 | ~132 MH/s | ~42,000 | ~4 | Same principle |
| 10 GH/s farm | 10,000 MH/s | ~3,100,000 | ~4 | Clamped to maxDiff |
| Small 50 MH/s GPU | 50 MH/s | ~16,000 | ~4 | Low vardiff |

### The 3 Vardiff Mechanisms

```
  Connection                1st share               Every 90s                  Every 30s
      |                        |                        |                        |
      v                        v                        v                        v
  [BOOTSTRAP]            [BOOTSTRAP]              [RETARGET]              [IDLE SWEEP]
  markAuthorized()       Quick estimation        Fine adjustment          Silence detection
                         vardiff * (time/15)      Max +25%/-20%           If idle > 30s
                                                  30% dead zone           vardiff + 50%
```

| Mechanism | When | Objective | Speed |
|-----------|------|-----------|-------|
| **Bootstrap** | 1st share from a new worker | Quick estimation of optimal vardiff | Instant (1 share) |
| **Retarget** | Every 90s, if 8+ shares | Fine adjustment toward 15s target | Gradual (max +25%/-20%) |
| **Idle Sweep** | Every 30s | Unblock a silent worker | Moderate (+50% per cycle) |

---

## 5. Vardiff Parameters - Version History

### v1 -> v2 (February 6, 2026)

**Problem**: The AMD worker (Vega 56, 132 MH/s) was oscillating wildly between 3,182 and 98,130 vardiff (10 changes/hour). This caused unrealistic hashrate spikes (329 MH/s displayed instead of 132 MH/s actual).

#### Before (v1): Initial Configuration

| Parameter | v1 Value | Effect |
|-----------|----------|--------|
| `minDiff` | 5,000 | Max ~200 MH/s per worker |
| `maxDiff` | 100,000 | Min ~500 MH/s per worker |
| `MAX_DIFF_CHANGE_RATIO` | 1.5 | Jumps of +50%/-33% per cycle |
| `variancePercent` | 25% | Retarget if avgTime < 11.25s or > 18.75s |
| Min shares retarget | 6 | Average over little data |
| Idle sweep | None | Stuck workers not detected |
| Bootstrap | None | 6+ cycles to converge |

**Example of AMD oscillation with v1:**

| Time | Vardiff | Shares/min | Displayed Hashrate | Problem |
|------|---------|------------|-------------------|---------|
| 0:00 | 20,000 | 8.5 | 56 MH/s | Too easy, shares too fast |
| 1:30 | 30,000 | 5.7 | 84 MH/s | Still too fast |
| 3:00 | 45,000 | 3.8 | 126 MH/s | Almost good... |
| 4:30 | 67,500 | 2.5 | 189 MH/s | Too hard! |
| 6:00 | 98,130 | 1.7 | **329 MH/s** | Way too hard |
| 7:30 | 65,420 | 2.6 | 183 MH/s | Coming back down... |
| 9:00 | 43,613 | 3.9 | 122 MH/s | Almost good... |
| 10:30 | 30,000 | 5.7 | 84 MH/s | Too easy again... |
| ... | ... | ... | ... | Endless cycle |

> Key problem: +50% jumps are too large, vardiff overshoots the target then comes back, then overshoots again...

#### After (v2): Anti-oscillation + Idle Sweep + Bootstrap

| Parameter | v1 Value | v2 Value | Reason for Change |
|-----------|----------|----------|-------------------|
| `minDiff` | 5,000 | **100** | Support farms up to ~200 GH/s |
| `maxDiff` | 100,000 | **500,000** | Support small GPUs (~40 MH/s) |
| `MAX_DIFF_CHANGE_RATIO` | 1.5 | **1.25** | Reduced jumps to +25%/-20% (anti-oscillation) |
| `variancePercent` | 25% | **30%** | Retarget only if avgTime < 10.5s or > 19.5s |
| Min shares retarget | 6 | **8** | More reliable average before adjusting |
| Idle sweep | None | **30s / +50%** | Detects and unblocks silent workers |
| Bootstrap | None | **1st share** | Quick estimation of optimal vardiff |

**Example of AMD convergence with v2:**

| Time | Vardiff | Shares/min | Displayed Hashrate | Comment |
|------|---------|------------|-------------------|---------|
| 0:00 | 20,000 | - | - | Connection, bootstrap active |
| 0:42 | 56,000 | - | - | Bootstrap: 1st share at 42s -> `20000 * 42/15` |
| 2:12 | 70,000 | 3.2 | 147 MH/s | Retarget +25% (shares slightly slow) |
| 3:42 | 70,000 | 3.8 | 132 MH/s | Dead zone, no change |
| 5:12 | 70,000 | 4.1 | 132 MH/s | Stable! |

> Vardiff stabilizes in ~2 cycles instead of oscillating indefinitely.

---

## 6. How a Share is Weighted (shareDiff)

### Formula

```
shareDiff = networkDifficulty / vardiff
```

The higher the vardiff, the "lighter" the share (because the miner is mining at an easier target).

### Example with Our Pool (networkDiff = 312 TH)

| Worker | Vardiff | shareDiff | Share Freq | Work/min | Estimated Hashrate |
|--------|---------|-----------|------------|----------|-------------------|
| Rig_4070x8 | 52,767 | 5.9 G | ~4/min | 23.6 G/min | ~1,010 MH/s |
| NVIDIA (Rig_4070Super) | 43,110 | 7.2 G | ~4/min | 28.9 G/min | ~448 MH/s |
| AMD (Vega 56) | 135,395 | 2.3 G | ~4/min | 9.2 G/min | ~132 MH/s |
| Rig_Test | 12,309 | 25.4 G | ~4/min | 101.5 G/min | ~571 MH/s |

> **Observation**: Even though the shareDiff values are very different, the total work per minute is proportional to the actual hashrate. That's the magic of vardiff!

### Why are shareDiff Values Inversely Related to Hashrate?

| The more powerful the GPU... | ... the higher the vardiff | ... the "lighter" each share | ... but it sends the same number |
|---|---|---|---|
| Rig_4070x8 (1010 MH/s) | vardiff 52,767 | shareDiff 5.9 G | ~4/min |
| Vega 56 (132 MH/s) | vardiff 135,395 | shareDiff 2.3 G | ~4/min |

This is counter-intuitive but logical: a powerful GPU has a harder vardiff so its shares "count less" individually, but the **total work volume** remains proportional to its power.

---

## 7. Bootstrap - Quick Start

### Without Bootstrap (v1): Slow Convergence

| Cycle | Time | Vardiff | Shares | Action |
|-------|------|---------|--------|--------|
| 0 | 0:00 | 20,000 | 0 | Connection |
| 1 | 1:30 | 20,000 | 3 | Not enough shares (< 6) |
| 2 | 3:00 | 20,000 | 5 | Still not enough |
| 3 | 4:30 | 30,000 | 8 | First retarget +50% |
| 4 | 6:00 | 45,000 | 8 | Retarget +50% |
| 5 | 7:30 | 67,500 | 8 | Retarget +50% |
| 6 | 9:00 | 67,500 | 7 | Dead zone, almost good |
| **Total** | **~9 min** | | | **Convergence after 6 cycles** |

### With Bootstrap (v2): Immediate Convergence

| Cycle | Time | Vardiff | Shares | Action |
|-------|------|---------|--------|--------|
| 0 | 0:00 | 20,000 | 0 | Connection, `markAuthorized()` |
| - | 0:42 | 56,000 | 1 | **Bootstrap!** `20000 * 42/15 = 56000` |
| 1 | 2:12 | 70,000 | 8 | Retarget +25% (fine-tuning) |
| 2 | 3:42 | 70,000 | 8 | Dead zone, stable |
| **Total** | **~2 min** | | | **Convergence after 1 bootstrap + 1 retarget** |

---

## 8. Idle Sweep - Unblocking Silent Workers

### Typical Scenario: AMD Worker Receives a Vardiff That's Too High

| Time | Event | Vardiff | Idle? |
|------|-------|---------|-------|
| 0:00 | Share OK | 135,000 | No |
| 0:30 | No share for 30s | 135,000 | **Yes** -> Idle Sweep |
| 0:30 | Idle Sweep: vardiff +50% | 202,500 | Reset |
| 0:45 | Share OK (easier diff) | 202,500 | No |
| 1:30 | Normal retarget | 180,000 | No |

> Without idle sweep, the worker would have been stuck until the next retarget (90s). Idle sweep reacts within 30s.

### Progression of a Completely Stuck Worker

If a worker can't find any shares (vardiff much too low = too hard):

| Time | Vardiff | Idle Sweep # | Comment |
|------|---------|-------------|---------|
| 0:00 | 10,000 | - | Vardiff too low, target too hard |
| 0:30 | 15,000 | #1 | +50%, still too hard |
| 1:00 | 22,500 | #2 | +50%, still too hard |
| 1:30 | 33,750 | #3 | +50%, starting to find shares |
| 1:32 | 33,750 | - | 1st share! Retarget will take over |
| 3:00 | 42,000 | - | Normal retarget, stable |

> Idle sweep increases vardiff by 50% every 30s until the worker starts finding shares again.

---

## 9. PPLNS - Reward Distribution

### Principle

PPLNS = **Pay Per Last N Shares**. When a block is found, the reward is distributed among the miners who contributed to the last `N` shares.

| Parameter | Value | Meaning |
|-----------|-------|---------|
| PPLNS factor | 2 | N = 2x the network difficulty |
| Pool fee | 1% | The pool keeps 1% of each block |
| Miner reward | 99% | Miners share 99% |

### Distribution Example

Block found! Reward = 6 ERG (1% fee = 0.06 ERG for the pool)

| Miner | % of shares in PPLNS window | Reward |
|-------|----------------------------|--------|
| Rig_4070x8 | 47% | 2.79 ERG |
| Rig_Test | 26% | 1.55 ERG |
| NVIDIA | 21% | 1.25 ERG |
| AMD | 6% | 0.35 ERG |
| **Total** | **100%** | **5.94 ERG** |

---

## 10. Block Lifecycle

| Step | Status | Delay | Detail |
|------|--------|-------|--------|
| 1 | **Found** | 0 | Hash < bNetwork, solution submitted to node |
| 2 | **Pending** | 0 - 24h | Waiting for 720 confirmations |
| 3 | **Confirmed** | ~24h | 720 subsequent blocks mined by the network |
| 4 | **Paid** | ~24h + a few min | Payments sent to miners |
| - | **Orphaned** | Variable | If another pool found the same block first |

### Required Confirmations

| Network | Confirmations | Average Time | Why |
|---------|--------------|-------------|-----|
| Ergo | 720 blocks | ~24 hours | Protection against chain reorganizations |
| Bitcoin | 100 blocks | ~16 hours | Same principle |
| Ethereum (PoS) | N/A | N/A | No more mining |

---

## 11. Hashrate - Where the Displayed Number Comes From

### Calculation Pipeline

```
GPU computes -> Share submitted -> shareDiff recorded -> API aggregates -> Frontend displays
```

| Step | Formula | Example |
|------|---------|---------|
| 1. Share submitted | `shareDiff = netDiff / vardiff` | 312T / 52767 = 5.9G |
| 2. Sum over 10 min | `SUM(shareDiff)` over 10 min | 150G |
| 3. Raw hashrate | `SUM / time` | 150G / 600s = 250 MH/s |
| 4. Correction factor | `raw * 1.08` | 250 * 1.08 = 270 MH/s |
| 5. Display | Rounded | **270 MH/s** |

### Why a 1.08 Correction Factor?

| Concept | Explanation |
|---------|-------------|
| **Autolykos2 Dataset** | GPUs must regenerate a 2.5 GB table at each epoch (~1024 blocks) |
| **Lost time** | During generation (1-4s), the GPU is not mining |
| **Consequence** | The hashrate measured from shares is ~8% lower than the actual hashrate |
| **Solution** | Multiply by 1.08 to compensate |
| **Reference** | MiningCore (open-source Ergo pool) uses 1.15, but calibrated to 1.08 for us |

### Verification: Pool vs HiveOS

| Source | Hashrate | Difference |
|--------|----------|------------|
| HiveOS (reference, 02/08) | 2.16 GH/s (969 + 711 + 479) | - |
| Pool with 1.08 factor | 2.05 - 2.13 GH/s | 2-5% |
| Pool WITHOUT factor | 1.90 - 2.01 GH/s | 8-15% |

> The 1.08 factor brings the gap down to only 2-5% vs HiveOS. A small remaining gap is normal because the hashrate calculated from shares is a statistical estimate.

---

## 12. Our Rigs - Current Configuration

#### v2 (February 8, 2026) - Current Config

| Rig | GPU | Software | Hashrate | Power |
|-----|-----|----------|----------|-------|
| Rig_4070x8 | 8x RTX 4070 | lolMiner 1.98a | ~969 MH/s | ~563W |
| Rig_4070Super (NVIDIA) | RTX 3080 + RTX 3070 + RTX 3060 Ti + RTX 4070 | lolMiner 1.98a | ~447 MH/s | - |
| Rig_4070Super (AMD) | 2x Vega 56 | TeamRedMiner 0.10.21 | ~264 MH/s | - |
| Rig_4070Super (total) | 6 GPU | lolMiner + TeamRedMiner | **~711 MH/s** | **~527W** |
| Rig_Test | RX 580 (mix) | TeamRedMiner 0.10.21 | ~479 MH/s | ~513W |
| **Total** | | | **~2.16 GH/s** | **~1,603W** |

#### v1 (February 6, 2026) - Previous Config

| Rig | GPU | Software | Hashrate | Power |
|-----|-----|----------|----------|-------|
| Rig_4070x8 | 8x RTX 4070 | lolMiner 1.98a | ~1,010 MH/s | ~950W |
| Rig_4070Super (NVIDIA) | RTX 3080 + GTX 1080 + GTX 1070 + GTX 1080 Ti x2 + RTX 3070 + RTX 4070 | lolMiner 1.98a | ~448 MH/s | ~450W |
| Rig_4070Super (AMD) | 1x Vega 56 | TeamRedMiner 0.10.21 | ~132 MH/s | ~200W |
| Rig_Test | Mix AMD | TeamRedMiner 0.10.21 | ~571 MH/s | ??? |
| **Total** | **21 GPU** | | **~2.16 GH/s** | **~1,616W** |

> **Changes v1 -> v2**: 2nd Vega 56 added to Rig_4070Super (132 -> 264 MH/s AMD). Some GPUs changed on Rig_4070Super NVIDIA. Rig_Test = RX 580.

### Mining Software Compatibility

| Software | Supported GPUs | Success Rate | Recommended? |
|----------|---------------|-------------|--------------|
| lolMiner | NVIDIA + AMD | ~95% | Yes (NVIDIA) |
| TeamRedMiner | AMD only | ~99.9% | Yes (AMD) |
| SRBMiner | AMD only | ~95% | No (higher rejection rate than TRM) |

---

## 13. Average Time to Find a Block

### Formula

```
Network share = Pool hashrate / Network hashrate
Network blocks per day = 720 (1 block every 2 min)
Pool blocks per day = 720 * Network share
Average time = 1 / Pool blocks per day
```

### With Our 2.16 GH/s (February 8, 2026)

| Data | Value |
|------|-------|
| Pool hashrate | 2.16 GH/s |
| Network hashrate | ~2.36 TH/s |
| Network share | 2.16 / 2,360 = **0.0915%** |
| Pool blocks per day | 720 * 0.000915 = **0.659** |
| **Average time** | **1 / 0.659 = ~1.5 days** |

> This is a **statistical average**. We could find a block in 2 hours or in 1 week. It's like the lottery: the probability is fixed but the outcome is random.
>
> **Note**: The network hashrate varies constantly. This calculation is a snapshot from 02/08/2026. The pool's frontend displays this estimate in real-time via the API.

---

## See Also

- [Shares](../mining/shares.md) - Detailed theory on shares
- [Difficulty & Hashrate](../blockchain/difficulty.md) - Difficulty calculations
- [PPLNS](../mining/pplns.md) - Reward distribution system
- [Architecture](architecture.md) - Technical overview
- [Stratum Protocol](../mining/stratum-protocol.md) - Miner <-> pool communication
