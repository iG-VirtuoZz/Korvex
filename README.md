<p align="center">
  <img src="https://img.shields.io/badge/Algorithm-Autolykos2-orange?style=flat-square" alt="Autolykos2" />
  <img src="https://img.shields.io/badge/Coin-Ergo-orange?style=flat-square" alt="Ergo" />
  <img src="https://img.shields.io/badge/Backend-TypeScript-blue?style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Frontend-React-61dafb?style=flat-square" alt="React" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" />
</p>

<h1 align="center">KORVEX</h1>
<p align="center"><strong>Open-source Ergo (Autolykos2) mining pool built from scratch in TypeScript.</strong></p>
<p align="center">No forks, no MiningCore — every component was written from the ground up.</p>

---

## Features

- **Custom Stratum Server** — Full implementation of the Ergo Stratum protocol with variable difficulty (vardiff)
- **PPLNS Payment System** — Pay-Per-Last-N-Shares with configurable window factor
- **Solo Mining Support** — Dedicated solo port with separate stats and 100% block reward to finder
- **Automatic Payouts** — Periodic payment cycles with EIP-27 compliance and configurable thresholds
- **Block Confirmation** — 720-block maturity waiting period with orphan detection
- **React Frontend** — Modern responsive dashboard with real-time stats, charts, and multi-language support
- **Multi-language** — 6 languages out of the box (EN, FR, RU, ZH, ES, DE)
- **Admin Dashboard** — Hidden admin panel with node monitoring, wallet status, payment controls, and financial stats
- **Rate Limiting** — Built-in DDoS protection on API endpoints
- **Discord Alerts** — Webhook notifications for found blocks

## Architecture

```
                    ┌─────────────┐
                    │   Miners    │
                    │ (lolMiner,  │
                    │ TeamRedMiner│
                    │  SRBMiner)  │
                    └──────┬──────┘
                           │ Stratum TCP
                    ┌──────▼──────┐
                    │   Stratum   │ Port 3416 (PPLNS)
                    │   Server    │ Port 3417 (Solo)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼───┐ ┌──────▼──────┐
       │  PostgreSQL  │ │ API  │ │  Ergo Node  │
       │  (shares,    │ │ REST │ │  (9053)     │
       │  blocks,     │ │(4000)│ │             │
       │  payments)   │ └──┬───┘ └─────────────┘
       └──────────────┘    │
                    ┌──────▼──────┐
                    │   React     │
                    │  Frontend   │
                    │ (Dashboard) │
                    └─────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js, TypeScript, Express |
| **Frontend** | React 19, TypeScript, Recharts |
| **Database** | PostgreSQL |
| **Algorithm** | Autolykos2 (Ergo PoW) |
| **Hashing** | blake2b-256 via `blakejs` + `@noble/hashes` |

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **PostgreSQL** >= 14
- **Ergo Node** fully synced ([ergo-node releases](https://github.com/ergoplatform/ergo/releases))

### 1. Clone and Install

```bash
git clone https://github.com/iG-VirtuoZz/Korvex.git
cd Korvex

# Backend
npm install

# Frontend
cd frontend && npm install && cd ..
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DB_PASS=your_database_password
ERGO_NODE_API_KEY=your_node_api_key
POOL_ADDRESS=your_pool_wallet_address
WALLET_PASS=your_wallet_password
ADMIN_PASSWORD=your_admin_password
```

See [`.env.example`](.env.example) for all available options.

### 3. Setup Database

```sql
CREATE DATABASE korvex_pool;
CREATE USER ergo WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE korvex_pool TO ergo;
```

The pool automatically creates all required tables on first startup.

### 4. Build and Run

```bash
# Build backend
npm run build

# Build frontend
cd frontend && npm run build && cd ..

# Start
npm start
```

### 5. Connect a Miner

**PPLNS (1% fee):**
```
Pool: stratum+tcp://your-domain:3416
Wallet: your_ergo_address.worker_name
```

**Solo (1.5% fee):**
```
Pool: stratum+tcp://your-domain:3417
Wallet: your_ergo_address.worker_name
```

Tested miners: **lolMiner**, **TeamRedMiner**, **SRBMiner**

## Project Structure

```
Korvex/
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Environment configuration
│   ├── api/
│   │   └── api.ts            # REST API (Express) + Admin endpoints
│   ├── stratum/
│   │   └── server.ts         # Stratum server (TCP) + Vardiff
│   ├── ergo/
│   │   └── node.ts           # Ergo node communication
│   ├── db/
│   │   ├── database.ts       # PostgreSQL queries
│   │   └── maintenance.ts    # Periodic tasks (confirmer, payer, cleanup)
│   └── payout/
│       ├── confirmer.ts       # Block confirmation (720 blocks)
│       └── payer.ts           # Automatic payment distribution
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # React Router + Layout
│   │   ├── App.css            # All styles (Modern Grid theme)
│   │   ├── api.ts             # API client
│   │   ├── pages/
│   │   │   ├── LandingPage.tsx    # Multi-coin landing page
│   │   │   ├── Home.tsx           # Pool dashboard (3 layouts)
│   │   │   ├── MinersPage.tsx     # Leaderboard
│   │   │   ├── MinerPage.tsx      # Individual miner stats
│   │   │   ├── HowToStart.tsx     # Mining guide (PPLNS + Solo)
│   │   │   ├── AdminDashboard.tsx # Admin panel
│   │   │   └── ...
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── LanguageSelector.tsx
│   │   │   └── ...
│   │   └── i18n/
│   │       └── locales/       # EN, FR, RU, ZH, ES, DE
│   └── public/
├── docs/                       # Comprehensive documentation
│   ├── blockchain/
│   │   ├── ergo-basics.md
│   │   ├── difficulty.md
│   │   └── blocks-rewards.md
│   ├── mining/
│   │   ├── shares.md
│   │   ├── stratum-protocol.md
│   │   ├── pplns.md
│   │   └── solo-mining.md
│   ├── pool-setup/
│   │   ├── architecture.md
│   │   ├── database.md
│   │   └── pool-internals.md
│   ├── wallet/
│   │   └── wallet-management.md
│   └── operations/
│       └── monitoring.md
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Configuration

All configuration is done through environment variables. See [`.env.example`](.env.example) for the complete list.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DB_PASS` | Yes | — | PostgreSQL password |
| `ERGO_NODE_API_KEY` | Yes | — | Ergo node API key |
| `POOL_ADDRESS` | Yes | — | Pool wallet address |
| `WALLET_PASS` | Yes | — | Wallet password for payouts |
| `POOL_FEE` | No | `0.01` | Pool fee (1%) |
| `SOLO_FEE` | No | `0.015` | Solo fee (1.5%) |
| `STRATUM_PORT` | No | `3416` | PPLNS stratum port |
| `STRATUM_SOLO_PORT` | No | `3417` | Solo stratum port |
| `API_PORT` | No | `4000` | REST API port |
| `MIN_PAYOUT_NANO` | No | `1000000000` | Minimum payout (1 ERG) |
| `PPLNS_FACTOR` | No | `2` | PPLNS window factor |
| `PAYOUT_CONFIRMATIONS` | No | `720` | Blocks to wait (~24h) |
| `PAYOUT_INTERVAL_MINUTES` | No | `10` | Payout cycle interval |
| `ADMIN_PASSWORD` | No | — | Admin dashboard password |
| `DISCORD_WEBHOOK_URL` | No | — | Discord alerts webhook |

## Documentation

Comprehensive guides are available in the [`docs/`](docs/) folder:

| Topic | Link |
|-------|------|
| Understanding Ergo | [docs/blockchain/ergo-basics.md](docs/blockchain/ergo-basics.md) |
| Difficulty & Hashrate | [docs/blockchain/difficulty.md](docs/blockchain/difficulty.md) |
| Blocks & Rewards | [docs/blockchain/blocks-rewards.md](docs/blockchain/blocks-rewards.md) |
| Shares & Vardiff | [docs/mining/shares.md](docs/mining/shares.md) |
| Stratum Protocol | [docs/mining/stratum-protocol.md](docs/mining/stratum-protocol.md) |
| PPLNS System | [docs/mining/pplns.md](docs/mining/pplns.md) |
| Solo Mining | [docs/mining/solo-mining.md](docs/mining/solo-mining.md) |
| Architecture | [docs/pool-setup/architecture.md](docs/pool-setup/architecture.md) |
| Database Schema | [docs/pool-setup/database.md](docs/pool-setup/database.md) |
| Internal Mechanics | [docs/pool-setup/pool-internals.md](docs/pool-setup/pool-internals.md) |
| Wallet Management | [docs/wallet/wallet-management.md](docs/wallet/wallet-management.md) |
| Monitoring & Ops | [docs/operations/monitoring.md](docs/operations/monitoring.md) |

## Production Deployment

For production use, we recommend:

- **Reverse proxy**: Nginx with SSL (Let's Encrypt)
- **Process manager**: systemd service
- **Ergo node**: Fully synced with `utxoBootstrap = true` and `checkEIP27 = true`
- **Firewall**: Only expose ports 3416 (stratum), 3417 (solo), 443 (HTTPS)
- **Backups**: Regular PostgreSQL backups

Example Nginx config:

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        root /path/to/frontend/build;
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

## Security

- All secrets are loaded from environment variables — never hardcoded
- Pool wallet is locked except during active payout cycles
- Admin dashboard is hidden (no public link) and password-protected
- API rate limiting protects against abuse (120 req/min per IP)
- EIP-27 compliance for safe transaction building with re-emission tokens

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Ergo Platform](https://ergoplatform.org/) for the blockchain
- The Ergo mining community for testing and feedback
- [Ergo Node](https://github.com/ergoplatform/ergo) for the reference implementation

---

<p align="center">
  <strong>Built with passion for the Ergo ecosystem.</strong>
</p>
