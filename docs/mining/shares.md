# Shares - Understanding the Fundamental Concept

## What is a Share?

A share is a **proof of work** submitted by a miner to the pool. It proves that the miner has actually performed mining computations.

### Simple Analogy

Imagine that finding a block is like finding a winning lottery ticket in a pile of 1 billion tickets.

- **Block** = winning ticket (1 in 1 billion chance)
- **Share** = ticket ending in "00" (1 in 100 chance)

The pool asks miners to show all tickets ending in "00". This proves they are actively searching, even if they haven't found the winner yet.

## Share vs Block

| | Share | Block |
|---|-------|------|
| **Difficulty** | Low (vardiff) | High (network) |
| **Frequency** | ~15 seconds | ~2 minutes (entire network) |
| **Reward** | No direct reward | 6 ERG |
| **Purpose** | Prove work | Validate transactions |

### The Link Between the Two

Each share is actually a **block attempt**. If by chance the share's hash is also below the network target -> it's a block!

```
If hash < bShare      -> Valid share
If hash < bNetwork    -> BLOCK FOUND!
```

## Share Validation

### What the Pool Verifies

1. **The miner is authorized** (valid address)
2. **The job exists** (not an expired old job)
3. **The nonce is unique** (no duplicates)
4. **The hash is valid** (full Autolykos2 verification)
5. **The hash < target** (difficulty met)

### The Autolykos2 Process

```python
def validate_share(msg, nonce, height, bShare, bNetwork):
    # 1. Compute the index i
    i = blake2b(msg + nonce) % N

    # 2. Generate the seed e
    e = blake2b(i + height + M)

    # 3. Compute 32 indices J
    J = [genIndex(e, k) for k in range(32)]

    # 4. Retrieve the r elements (2.5 GB table)
    r = [element(J[k]) for k in range(32)]

    # 5. Sum to obtain f
    f = sum(r)

    # 6. Final hash
    fh = blake2b(f)

    # 7. Check targets
    if fh < bShare:
        share_valid = True
        if fh < bNetwork:
            block_found = True

    return share_valid, block_found
```

## Types of Shares

### Valid Share

The hash is below the miner's target. The pool accepts it and counts it for PPLNS.

### Invalid Share

Several possible reasons:

| Error | Cause | Solution |
|-------|-------|----------|
| "Low difficulty" | Hash > target | The miner is using an incorrect b |
| "Job not found" | Job expired | The miner is behind |
| "Duplicate share" | Nonce already submitted | Miner bug or cheating |
| "Invalid nonce" | Incorrect format | Miner bug |

### Block Candidate

The hash is below the network target! The pool submits the solution to the Ergo node.

## Share Weight (shareDiff)

Not all shares have the same "value". A share has a **weight** proportional to its difficulty:

```
shareDiff = networkDifficulty / vardiff
```

### Example

| Miner | Vardiff | shareDiff | Interpretation |
|-------|---------|-----------|----------------|
| Small rig | 30,000 | 10.6 G | "Light" share |
| Large rig | 5,000 | 63.6 G | "Heavy" share |

The large rig has less frequent but heavier shares. Ultimately, the **total work** is proportional to the actual hashrate.

## Computing Hashrate from Shares

```
hashrate = SUM(shareDiff) / time
```

Example over 5 minutes:
- Miner A: 20 shares x 31.8G shareDiff = 636 G of work
- hashrate = 636G / 300s = 2.12 GH/s

## See Also

- [Difficulty & Hashrate](../blockchain/difficulty.md) - Vardiff and calculations
- [Stratum Protocol](stratum-protocol.md) - How shares are submitted
- [PPLNS](pplns.md) - How shares are rewarded
