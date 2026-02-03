# KORVEX - Ergo Mining Pool

Pool de minage Ergo personnelle. Ce repository contient le code source et la documentation complete pour comprendre et operer la pool.

## Liens Rapides

| Section | Description |
|---------|-------------|
| [Comprendre Ergo](docs/blockchain/ergo-basics.md) | Blockchain Ergo, Autolykos2, comment ca marche |
| [Difficulte & Hashrate](docs/blockchain/difficulty.md) | Difficulte reseau, difficulte share, calcul hashrate |
| [Les Shares](docs/mining/shares.md) | C'est quoi une share, vardiff, validation PoW |
| [Protocole Stratum](docs/mining/stratum-protocol.md) | Communication pool-mineur, mining.notify, submit |
| [PPLNS](docs/mining/pplns.md) | Systeme de repartition des rewards |
| [Architecture Pool](docs/pool-setup/architecture.md) | Vue d'ensemble backend/frontend/DB |
| [Gestion Wallet](docs/wallet/wallet-management.md) | Wallet pool, paiements automatiques |
| [Operations](docs/operations/monitoring.md) | Monitoring, logs, troubleshooting |

## Infos Pool KORVEX

| Info | Valeur |
|------|--------|
| **Domaine** | korvexpool.com |
| **VPS** | OVH 213.32.23.246 |
| **Port Stratum** | 3416 |
| **Fee** | 1% |
| **Modele paiement** | PPLNS (factor=2) |
| **Seuil paiement** | 1 ERG |
| **Confirmations** | 720 blocs |

## Stack Technique

- **Backend**: Node.js / TypeScript, Express
- **Frontend**: React / TypeScript, Recharts
- **Database**: PostgreSQL
- **Algorithme**: Autolykos2

## Structure du Repo

```
Pool-Korvex/
├── docs/
│   ├── blockchain/      # Comprendre Ergo et la blockchain
│   ├── mining/          # Shares, Stratum, PPLNS
│   ├── pool-setup/      # Comment monter une pool
│   ├── wallet/          # Gestion du wallet
│   └── operations/      # Monitoring et maintenance
└── src/                 # Code source de la pool
```

## Demarrage Rapide

Pour connecter un mineur a la pool:
```
stratum+tcp://korvexpool.com:3416
Wallet: ton_adresse_ergo.nom_worker
```

## Contact

- Email: guillaumesastre34@gmail.com
- GitHub: iG-VirtuoZz
