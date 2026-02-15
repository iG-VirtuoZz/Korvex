# Understanding Ergo and Autolykos2

## What is Ergo?

Ergo is a Proof-of-Work (PoW) blockchain like Bitcoin, but with key differences:

- **Algorithm**: Autolykos2 (ASIC-resistant, optimized for GPUs)
- **Block time**: ~2 minutes (120 seconds)
- **Current reward**: ~6 ERG per block (decreasing over time)
- **Max supply**: ~97.7 million ERG

## How Does Mining Work?

### The Basic Principle

1. The **Ergo node** generates a "block candidate" containing the transactions to validate
2. **Miners** search for a number (nonce) that, combined with the candidate, produces a valid hash
3. The first miner to find a valid hash **wins the block reward**
4. The block is added to the blockchain, and the process starts again

### The Autolykos2 Algorithm

Autolykos2 is the mining algorithm specific to Ergo. It is designed to:

- **Resist ASICs**: requires a large amount of memory (~2.5 GB)
- **Be efficient on GPUs**: optimized for modern graphics cards
- **Be quickly verifiable**: a node can verify a solution without redoing the entire computation

#### Share Validation Steps

```
1. Combine the message (msg) with the nonce
2. Compute an index i = blake2b(msg + nonce) mod N
3. Generate a seed e from i
4. Compute 32 indices J from e
5. For each J, retrieve an element r from a ~2.5 GB table
6. Sum the 32 r elements to obtain f
7. Hash f to obtain fh (the final hash)
8. If fh < target -> valid solution!
```

**36 blake2b256 calls** are required to validate a single share. This is what makes Autolykos2 memory-intensive.

## The Constant q and the Target b

In Ergo, difficulty is represented by two values:

### q (constant)
```
q ~ 2^256
```
This is the total number of possible hashes (the complete search space).

### b (target)
```
b = q / networkDifficulty
```
This is the **threshold** below which a hash is valid. The larger `b` is, the easier it is to find a valid hash.

### Concrete Example

If `networkDifficulty = 300 T` (300 trillions):
```
b = 2^256 / 300,000,000,000,000
b ~ 3.86 x 10^62
```

A hash `fh` is valid if `fh < b`.

## See Also

- [Difficulty & Hashrate](difficulty.md) - How difficulty works
- [Shares](../mining/shares.md) - Shares vs blocks
- [Ergo Official Website](https://ergoplatform.org)
- [Ergo Documentation](https://docs.ergoplatform.com)
