# Monitoring and Operations

## Health Check

### Endpoint /api/health

```bash
curl http://127.0.0.1:4000/api/health
```

Response:
```json
{
  "status": "ok",
  "node": {
    "synced": true,
    "headersHeight": 1713851,
    "fullHeight": 1713851,
    "peersCount": 113,
    "difficulty": 304135224164352
  },
  "stratum": {
    "sessions": 3,
    "miners": ["9iQUvjNrpuhq..."]
  },
  "payout": {
    "confirmations_required": 720,
    "blocks_pending": 0,
    "blocks_confirmed": 2,
    "blocks_orphan": 0,
    "miners_payable": 1,
    "total_payable_nano": "5940000000"
  }
}
```

### What to Check

| Field | Expected Value | Alert If |
|-------|---------------|----------|
| `node.synced` | `true` | `false` |
| `node.peersCount` | > 10 | < 5 |
| `stratum.sessions` | > 0 | = 0 (no miners) |
| `payout.blocks_orphan` | 0 | > 0 (investigate) |

## Logs

### View Logs in Real-Time

```bash
sudo journalctl -u korvex-pool -f
```

### View the Last 100 Lines

```bash
sudo journalctl -u korvex-pool -n 100 --no-pager
```

### Filter by Type

```bash
# Shares only
sudo journalctl -u korvex-pool | grep "Share OK"

# Errors only
sudo journalctl -u korvex-pool | grep -i "error"

# Blocks found
sudo journalctl -u korvex-pool | grep "BLOC TROUVE"
```

## systemd Service

### Basic Commands

```bash
# Start
sudo systemctl start korvex-pool

# Stop
sudo systemctl stop korvex-pool

# Restart
sudo systemctl restart korvex-pool

# Status
sudo systemctl status korvex-pool
```

### Configuration

File: `/etc/systemd/system/korvex-pool.service`

```ini
[Unit]
Description=KORVEX Ergo Mining Pool
After=network.target postgresql.service

[Service]
Type=simple
User=ergo
WorkingDirectory=/home/ergo/pool
ExecStart=/usr/bin/node /home/ergo/pool/dist/index.js
Restart=always
RestartSec=10
EnvironmentFile=/home/ergo/pool/.env

[Install]
WantedBy=multi-user.target
```

## Key Metrics

### Pool Hashrate

```bash
curl -s http://127.0.0.1:4000/api/stats | jq '.hashrate'
```

### Number of Miners

```bash
curl -s http://127.0.0.1:4000/api/health | jq '.stratum.sessions'
```

### Recent Shares

```sql
SELECT worker, COUNT(*), MAX(created_at)
FROM shares
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY worker;
```

### Pending Blocks

```sql
SELECT height, status, created_at
FROM blocks
WHERE status = 'pending';
```

## Recommended Alerts

### Health Check Script

File: `/home/ergo/pool/korvex-healthcheck.sh`

```bash
#!/bin/bash
HEALTH=$(curl -s http://127.0.0.1:4000/api/health)
SYNCED=$(echo $HEALTH | jq -r '.node.synced')
SESSIONS=$(echo $HEALTH | jq -r '.stratum.sessions')

if [ "$SYNCED" != "true" ]; then
  echo "ALERT: Node not synchronized!"
  # Send Discord/Telegram notification
fi

if [ "$SESSIONS" -lt 1 ]; then
  echo "ALERT: No miners connected!"
fi
```

### Cron

```bash
# Every 5 minutes
*/5 * * * * /home/ergo/pool/korvex-healthcheck.sh >> /home/ergo/pool/healthcheck.log 2>&1
```

## Troubleshooting

### Node Not Syncing

```bash
# Check peers
curl http://127.0.0.1:9053/peers/connected -H "api_key: hello"

# Restart the node
sudo systemctl restart ergo-node
```

### No Miners Connected

1. Check that port 3416 is open:
   ```bash
   sudo ufw status
   netstat -tlnp | grep 3416
   ```

2. Test the connection:
   ```bash
   telnet korvexpool.com 3416
   ```

### Rejected Shares "Low difficulty"

The vardiff is misconfigured. Check:
- `session.ts`: formula `avgTime / target` (not the reverse)
- `server.ts`: `bShare = bNetwork * vardiff`

### Stuck Payments

1. Check for "unknown" payments:
   ```sql
   SELECT * FROM payments WHERE status = 'unknown';
   ```

2. Check on the explorer if the transaction exists

3. Update manually:
   ```sql
   UPDATE payments SET status = 'sent', tx_hash = 'xxx' WHERE id = Y;
   -- or
   UPDATE payments SET status = 'failed' WHERE id = Y;
   ```

## See Also

- [Pool Architecture](../pool-setup/architecture.md)
- [Wallet Management](../wallet/wallet-management.md)
- [Difficulty & Hashrate](../blockchain/difficulty.md)
