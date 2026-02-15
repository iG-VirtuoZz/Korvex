# Pool Wallet Management

## The Pool Wallet

The pool wallet is an Ergo wallet managed by the **Ergo node**. It:
- Receives the rewards from found blocks
- Sends payments to miners

**KORVEX Address**: `9h4UsBoiaFSJAyUSnEgvnjjq6XBptx8vXbc4KPiC8Q5pGuybtYN`

## Wallet Security

### Password

The wallet is protected by a password stored in `.env`:
```
WALLET_PASS=your_secret_password
```

**IMPORTANT**:
- Never commit the `.env` file to GitHub
- Use `chmod 600 .env` to restrict permissions
- Back up the password and mnemonic in a safe place

### Locking

The wallet is **locked by default**. It is unlocked only during payments (~10 seconds max).

```
Normal state: wallet locked
             |
Payment cycle: unlock -> send payments -> lock
             |
Return: wallet locked
```

At pool startup, a `lockWallet()` is executed to ensure the wallet is locked (in case a previous crash left it open).

## Payment Cycle

### Conditions

A payment is made when:
1. The miner has a balance >= **1 ERG** (minimum threshold)
2. There are no "unknown" payments pending
3. The wallet has sufficient funds

### Steps

```
1. Check for no "unknown" payments
   |
2. Retrieve miners with balance >= 1 ERG
   |
3. Unlock the wallet
   |
4. For each batch (max 20 miners):
   a. Debit balances (SQL transaction)
   b. Create payments with "pending" status
   c. Send the transaction to the node
   d. If OK: status "sent" + txHash
      If error: re-credit balances + status "failed"
      If timeout: status "unknown" (manual intervention required)
   |
5. Lock the wallet
```

### Payment Statuses

| Status | Meaning | Action |
|--------|---------|--------|
| `pending` | Reserved, not yet sent | Wait |
| `sent` | Transaction broadcasted | OK, nothing to do |
| `failed` | Error, balance re-credited | Check the logs |
| `unknown` | Timeout, status uncertain | **Manual intervention required** |

### "Unknown" Payments

If a payment has "unknown" status, **all automatic payments are blocked** until manual resolution.

Why? We don't know whether the transaction was broadcasted or not. It must be checked manually on the blockchain explorer.

## Wallet Commands

### Via the Ergo Node API

**Unlock**:
```bash
curl -X POST "http://127.0.0.1:9053/wallet/unlock" \
  -H "api_key: hello" \
  -H "Content-Type: application/json" \
  -d '{"pass": "password"}'
```

**Lock**:
```bash
curl -X GET "http://127.0.0.1:9053/wallet/lock" \
  -H "api_key: hello"
```

**Check balance**:
```bash
curl "http://127.0.0.1:9053/wallet/balances" \
  -H "api_key: hello"
```

**Send a payment**:
```bash
curl -X POST "http://127.0.0.1:9053/wallet/payment/send" \
  -H "api_key: hello" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {"address": "9xxx...", "value": 1000000000}
    ],
    "fee": 1000000
  }'
```

## Creating/Restoring a Wallet

### New Wallet

```bash
curl -X POST "http://127.0.0.1:9053/wallet/init" \
  -H "api_key: hello" \
  -H "Content-Type: application/json" \
  -d '{"pass": "new_password"}'
```

Response: the **mnemonic** (15 words). **YOU MUST BACK THIS UP!**

### Restoring a Wallet

> **WARNING**: This does NOT work if the node is in **pruning** mode!

```bash
curl -X POST "http://127.0.0.1:9053/wallet/restore" \
  -H "api_key: hello" \
  -H "Content-Type: application/json" \
  -d '{
    "pass": "password",
    "mnemonic": "word1 word2 word3 ... word15",
    "usePre1627KeyDerivation": false
  }'
```

## Transaction Fees

Each payment has a fee of **0.001 ERG** (1,000,000 nanoERG).

These fees are paid by the pool wallet, not by the miner.

## See Also

- [PPLNS](../mining/pplns.md) - How rewards are calculated
- [Blocks and Rewards](../blockchain/blocks-rewards.md) - Confirmations
- [Monitoring](../operations/monitoring.md) - Verifying payments
