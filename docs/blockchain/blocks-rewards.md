# Blocks, Rewards, and Orphans

## What is a Block?

A block is a "package" of transactions that is added to the blockchain. It contains:

- **Header**: hash of the previous block, timestamp, difficulty, nonce
- **Transactions**: the ERG transfers to validate
- **Coinbase**: the special transaction that creates new ERG (the reward)

## Block Reward

### Composition

An Ergo block reward consists of:

1. **Emission reward**: newly created ERG (currently ~6 ERG)
2. **Transaction fees**: fees paid by users

### Emission Schedule

The emission decreases over time according to a fixed schedule:

| Period | Block Height | Reward per Block |
|--------|-------------|-----------------|
| Early | 0 - 525,600 | 75 ERG |
| Current | ~1,700,000 | ~6 ERG |
| Future | > 2,000,000 | ~3 ERG |
| Final | > 2,500,000 | 0 ERG (fees only) |

### How to Retrieve the Current Reward?

Via the Ergo node API:
```
GET /emission/at/{height}
```

## Confirmations

### Why Wait for Confirmations?

When a block is found, it is not immediately "safe":
- Another miner may have found a block at the same time
- The network may reorganize the chain (reorg)
- Other blocks need to be built on top of it first

### How Many Confirmations?

| Confirmations | Time (~) | Security |
|---------------|----------|----------|
| 1 | 2 min | Very risky |
| 10 | 20 min | Risky |
| 30 | 1 hour | Acceptable for small amounts |
| 720 | 24 hours | Industry standard for pools |

**KORVEX** waits for **720 confirmations** (~24h) before crediting balances. This is the industry standard.

## Orphans (Orphaned Blocks)

### What is an Orphan?

An orphaned block is a block that was valid but is no longer part of the main chain. This happens when:

1. Two miners find a block almost simultaneously
2. The network "chooses" one of the two branches
3. The other block becomes orphaned and its reward is lost

### Orphan Detection

The pool must verify that its blocks are still on the main chain:

```
1. Retrieve the block IDs at the block's height
2. Compare with the blockId we recorded
3. If our blockId is no longer present -> orphan!
```

### Typical Orphan Rate

- Well-connected pools: < 1%
- Poorly connected pools: 2-5%
- Congested network: can increase

## Lifecycle of a Found Block

```
1. BLOCK FOUND!
   |
2. Submitted to the node (submitSolution)
   |
3. Recorded with status "pending"
   |
4. PPLNS distribution calculated (not yet credited)
   |
5. Waiting for confirmations (720 blocks = ~24h)
   |
6. Orphan check
   |
   +-- If orphan -> status "orphan", no credit
   |
   +-- If confirmed -> status "confirmed", balances credited
```

## See Also

- [Understanding Ergo](ergo-basics.md) - The basics
- [PPLNS](../mining/pplns.md) - Reward distribution
- [Wallet Management](../wallet/wallet-management.md) - Payments
