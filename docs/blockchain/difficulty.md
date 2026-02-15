# Difficulty and Hashrate

## The Two Types of Difficulty

### 1. Network Difficulty

This is the difficulty required to find a **valid block**. It is automatically adjusted by the Ergo network every 1024 blocks to maintain an average time of ~2 minutes per block.

**Currently**: ~300-320 T (trillions)

If more miners join the network -> difficulty increases
If miners leave -> difficulty decreases

### 2. Share Difficulty (Vardiff)

This is the difficulty required to find a **valid share** on the pool. It is much lower than the network difficulty so that miners can prove their work regularly.

**Typically**: 10,000 - 50,000 (variable per miner)

## How Does It Work?

### The Target b

In Ergo:
```
b = q / difficulty
```

- **bNetwork** = q / networkDifficulty (target for a block)
- **bShare** = bNetwork x vardiff (target for a share)

The larger `b` is -> the easier it is to find a valid hash.

### Concrete Example

```
networkDifficulty = 318 T
vardiff = 10,000

bNetwork = q / 318T  (very small = very hard)
bShare = bNetwork x 10,000  (larger = easier)
```

The miner mines against `bShare`. If they find a hash < bShare -> valid share.
If they find a hash < bNetwork -> BLOCK FOUND!

## Vardiff (Variable Difficulty)

### Why Vardiff?

Without vardiff, all miners would have the same difficulty:
- A **large rig** (5 GH/s) would find shares every 2 seconds -> spam
- A **small rig** (100 MH/s) would find shares every 2 minutes -> too few proofs of work

Vardiff adjusts the difficulty **per miner** so that each one finds a share approximately every **15 seconds**.

### How Does It Work?

1. The pool observes the time between a miner's shares
2. If shares arrive too fast -> increase vardiff (harder target)
3. If shares arrive too slowly -> decrease vardiff (easier target)

### Formula

```
newVardiff = oldVardiff x (observedTime / targetTime)
```

Example:
- targetTime = 15 seconds
- observedTime = 30 seconds (shares too slow)
- newVardiff = 10,000 x (30/15) = 20,000 (easier target)

## Hashrate Calculation

### Formula

```
hashrate = SUM(shareDiff) / time
```

Where `shareDiff = networkDifficulty / vardiff`

### Example

A miner with vardiff=10,000 and networkDiff=318T:
```
shareDiff = 318T / 10,000 = 31.8 billion

If they find 4 shares in 60 seconds:
hashrate = (4 x 31.8G) / 60 = 2.12 GH/s
```

### Why Does This Work?

Each share proves a certain amount of "work" proportional to `shareDiff`. A powerful miner with a low vardiff has "heavier" shares than a small miner with a high vardiff. Ultimately, the calculated hashrate reflects the true computing power.

## Low / Medium / High Difficulty Ports

Some pools offer multiple ports with fixed difficulties:

| Port | Difficulty | Intended For |
|------|------------|--------------|
| 3416 | Low (auto) | Small rigs < 500 MH/s |
| 3417 | Medium | Medium rigs 500 MH/s - 2 GH/s |
| 3418 | High | Large rigs > 2 GH/s |

**KORVEX** uses a single port (3416) with **automatic vardiff** that adapts to each miner.

## See Also

- [Understanding Ergo](ergo-basics.md) - Ergo basics
- [Shares](../mining/shares.md) - Shares and validation
- [Stratum Protocol](../mining/stratum-protocol.md) - How vardiff is communicated
