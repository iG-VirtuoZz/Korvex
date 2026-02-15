# Stratum Protocol for Ergo

## What is Stratum?

Stratum is the **communication protocol** between miners and the pool. It is a JSON-RPC protocol over TCP.

```
[GPU Miner] <--TCP/JSON--> [Pool Stratum Server] <--HTTP--> [Ergo Node]
```

## Stratum Messages

### 1. mining.subscribe

The miner announces itself to the pool.

**Miner -> Pool:**
```json
{
  "id": 1,
  "method": "mining.subscribe",
  "params": ["lolMiner/1.98"]
}
```

**Pool -> Miner:**
```json
{
  "id": 1,
  "result": [
    [["mining.set_difficulty", "subscription_id"], ["mining.notify", "subscription_id"]],
    "extraNonce1",  // 4 hex characters (e.g., "0a3f")
    6               // extraNonce2 size in bytes
  ],
  "error": null
}
```

### 2. mining.authorize

The miner authenticates with its address and worker name.

**Miner -> Pool:**
```json
{
  "id": 2,
  "method": "mining.authorize",
  "params": ["9iQUvjNrpuhq...K2ZmMQb.Rig_4070x8", ""]
}
```

**Pool -> Miner:**
```json
{
  "id": 2,
  "result": true,
  "error": null
}
```

### 3. mining.set_difficulty

The pool informs the miner of its difficulty.

**Pool -> Miner:**
```json
{
  "id": null,
  "method": "mining.set_difficulty",
  "params": [1]
}
```

> **ERGO Note**: Ergo miners (lolMiner, Rigel, SRBMiner) **ignore** this message! They use the `b` value from `mining.notify` directly.

### 4. mining.notify

The pool sends a new job to mine.

**Pool -> Miner:**
```json
{
  "id": null,
  "method": "mining.notify",
  "params": [
    "1a",                    // [0] jobId (hex)
    1713851,                 // [1] block height
    "a1b2c3d4...",          // [2] msg (header to hash)
    "",                      // [3] (unused)
    "",                      // [4] (unused)
    "00000002",              // [5] version
    "3591847562...",         // [6] b (TARGET!) <- The miner uses THIS
    "",                      // [7] (unused)
    false                    // [8] clean_jobs
  ]
}
```

**IMPORTANT**: `params[6]` contains the **target b**. This is THE value the miner uses to determine if its hash is valid.

### 5. mining.submit

The miner submits a share.

**Miner -> Pool:**
```json
{
  "id": 3,
  "method": "mining.submit",
  "params": [
    "9iQUvjNrpuhq...Rig_4070x8",  // [0] worker
    "1a",                          // [1] jobId
    "a1b2c3d4e5f6"                // [2] extraNonce2 (12 hex chars)
  ]
}
```

**Pool -> Miner:**
```json
{
  "id": 3,
  "result": true,   // or false if rejected
  "error": null     // or ["21", "Low difficulty share"]
}
```

## The Complete Nonce

```
nonce = extraNonce1 + extraNonce2
```

- **extraNonce1** (4 chars): assigned by the pool, unique per session
- **extraNonce2** (12 chars): chosen by the miner

Example:
```
extraNonce1 = "0a3f"
extraNonce2 = "a1b2c3d4e5f6"
complete nonce = "0a3fa1b2c3d4e5f6" (16 chars = 8 bytes)
```

## The multiplyDifficulty Model (Ergo)

For Ergo, the pool uses the **multiplyDifficulty** model:

```
bShare = bNetwork x vardiff
```

This `bShare` is sent in `mining.notify params[6]`.

### Why?

Ergo miners ignore `mining.set_difficulty` and use `params[6]` directly as the target. Therefore, to control vardiff, the pool must **modify the b value** that is sent.

### Example

```
networkDifficulty = 318 T
bNetwork = q / 318T = small number

vardiff = 10,000
bShare = bNetwork x 10,000 = number 10,000x larger = easier target
```

## Complete Sequence

```
1. Miner connects (TCP)
   |
2. mining.subscribe -> Pool responds with extraNonce1
   |
3. mining.authorize -> Pool verifies the address
   |
4. mining.set_difficulty(1) -> Miner ignores (Ergo)
   |
5. mining.notify with job + pre-multiplied b
   |
6. Miner mines...
   |
7. Miner finds hash < b -> mining.submit
   |
8. Pool validates -> result: true or error
   |
9. If vardiff changes -> new mining.notify with new b
   |
10. Back to step 6.
```

## See Also

- [Shares](shares.md) - Share validation
- [Difficulty & Hashrate](../blockchain/difficulty.md) - Vardiff
- [Pool Architecture](../pool-setup/architecture.md) - Server implementation
