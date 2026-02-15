# Monitoring et Operations

## Healthcheck

### Endpoint /api/health

```bash
curl http://127.0.0.1:4000/api/health
```

Reponse :
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

### Points a verifier

| Champ | Valeur attendue | Alerte si |
|-------|-----------------|-----------|
| `node.synced` | `true` | `false` |
| `node.peersCount` | > 10 | < 5 |
| `stratum.sessions` | > 0 | = 0 (aucun mineur) |
| `payout.blocks_orphan` | 0 | > 0 (investiguer) |

## Logs

### Voir les logs en temps reel

```bash
sudo journalctl -u korvex-pool -f
```

### Voir les 100 dernieres lignes

```bash
sudo journalctl -u korvex-pool -n 100 --no-pager
```

### Filtrer par type

```bash
# Shares uniquement
sudo journalctl -u korvex-pool | grep "Share OK"

# Erreurs uniquement
sudo journalctl -u korvex-pool | grep -i "error"

# Blocs trouves
sudo journalctl -u korvex-pool | grep "BLOC TROUVE"
```

## Service systemd

### Commandes de base

```bash
# Demarrer
sudo systemctl start korvex-pool

# Arreter
sudo systemctl stop korvex-pool

# Redemarrer
sudo systemctl restart korvex-pool

# Status
sudo systemctl status korvex-pool
```

### Configuration

Fichier : `/etc/systemd/system/korvex-pool.service`

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

## Metriques cles

### Hashrate pool

```bash
curl -s http://127.0.0.1:4000/api/stats | jq '.hashrate'
```

### Nombre de mineurs

```bash
curl -s http://127.0.0.1:4000/api/health | jq '.stratum.sessions'
```

### Shares recentes

```sql
SELECT worker, COUNT(*), MAX(created_at)
FROM shares
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY worker;
```

### Blocs en attente

```sql
SELECT height, status, created_at
FROM blocks
WHERE status = 'pending';
```

## Alertes recommandees

### Script healthcheck

Fichier : `/home/ergo/pool/korvex-healthcheck.sh`

```bash
#!/bin/bash
HEALTH=$(curl -s http://127.0.0.1:4000/api/health)
SYNCED=$(echo $HEALTH | jq -r '.node.synced')
SESSIONS=$(echo $HEALTH | jq -r '.stratum.sessions')

if [ "$SYNCED" != "true" ]; then
  echo "ALERTE: Noeud non synchronise!"
  # Envoyer notification Discord/Telegram
fi

if [ "$SESSIONS" -lt 1 ]; then
  echo "ALERTE: Aucun mineur connecte!"
fi
```

### Cron

```bash
# Toutes les 5 minutes
*/5 * * * * /home/ergo/pool/korvex-healthcheck.sh >> /home/ergo/pool/healthcheck.log 2>&1
```

## Troubleshooting

### Le noeud ne synchronise pas

```bash
# Verifier les peers
curl http://127.0.0.1:9053/peers/connected -H "api_key: hello"

# Redemarrer le noeud
sudo systemctl restart ergo-node
```

### Aucun mineur connecte

1. Verifier que le port 3416 est ouvert :
   ```bash
   sudo ufw status
   netstat -tlnp | grep 3416
   ```

2. Tester la connexion :
   ```bash
   telnet korvexpool.com 3416
   ```

### Shares rejetees "Low difficulty"

Le vardiff est mal configure. Verifier :
- `session.ts` : formule `avgTime / target` (pas l'inverse)
- `server.ts` : `bShare = bNetwork * vardiff`

### Paiements bloques

1. Verifier les paiements "unknown" :
   ```sql
   SELECT * FROM payments WHERE status = 'unknown';
   ```

2. Verifier sur l'explorateur si la tx existe

3. Mettre a jour manuellement :
   ```sql
   UPDATE payments SET status = 'sent', tx_hash = 'xxx' WHERE id = Y;
   -- ou
   UPDATE payments SET status = 'failed' WHERE id = Y;
   ```

## Voir aussi

- [Architecture Pool](../pool-setup/architecture.md)
- [Gestion Wallet](../wallet/wallet-management.md)
- [Difficulte & Hashrate](../blockchain/difficulty.md)
