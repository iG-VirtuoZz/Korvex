# KORVEX Pool Architecture

## Overview

```
                    +---------------------------------------------+
                    |              VPS (Ubuntu)                    |
                    |                                             |
+----------+       |  +-------------+    +--------------+        |
|  Miner   |<----->|  |  Stratum    |<-->|  Ergo Node   |        |
|  (GPU)   |  TCP  |  |  Server     |    |  (port 9053) |        |
+----------+  3416 |  |  (port 3416)|    +--------------+        |
                    |  +------+------+                            |
                    |         |                                   |
                    |         v                                   |
                    |  +-------------+    +--------------+        |
                    |  |   API       |<-->|  PostgreSQL  |        |
+----------+       |  |  (port 4000)|    |  (port 5432) |        |
| Frontend |<----->|  +-------------+    +--------------+        |
| (React)  |  HTTPS|                                             |
+----------+       |  +-------------+                            |
                    |  |   nginx     |                            |
                    |  |  (reverse   |                            |
                    |  |   proxy)    |                            |
                    |  +-------------+                            |
                    +---------------------------------------------+
```

## Components

### 1. Ergo Node

The Ergo node is the **link to the blockchain**. It:
- Synchronizes the complete blockchain
- Provides block candidates for mining
- Receives found solutions
- Manages the pool wallet

**Port**: 9053 (REST API, bound to 127.0.0.1 only)
**Config**: `/home/ergo/node/ergo.conf`

### 2. Stratum Server

The Stratum server **communicates with the miners**. It:
- Accepts TCP connections from miners
- Sends jobs (mining.notify)
- Receives and validates shares
- Manages vardiff per session
- Submits found blocks to the node

**Port**: 3416 (TCP, open to public)
**Code**: `src/stratum/server.ts`, `src/stratum/session.ts`

### 3. REST API

The API provides **data for the dashboard**. It:
- Exposes pool stats (hashrate, blocks, miners)
- Allows miners to view their balance
- Provides data for charts

**Port**: 4000 (HTTP, bound to 127.0.0.1)
**Code**: `src/api/api.ts`

### 4. PostgreSQL

The database **stores everything**:
- Submitted shares
- Found blocks
- Miner balances
- Payment history
- Hashrate aggregations

**Port**: 5432 (local only)
**Code**: `src/db/database.ts`

### 5. React Frontend

The web dashboard **displays information**:
- Real-time stats
- Hashrate and difficulty charts
- Miner page with balance and workers
- Profitability calculator

**Build**: `/home/ergo/pool/frontend/build/`
**Code**: `frontend/src/`

### 6. nginx

The reverse proxy **exposes everything**:
- HTTPS for the frontend and API
- Let's Encrypt certificate
- HTTP -> HTTPS redirection

## Data Flow

### When a Miner Submits a Share

```
1. Miner -> TCP -> Stratum Server
2. Server validates the hash (autolykos2.ts)
3. Server records it in PostgreSQL (database.ts)
4. If block found:
   a. Submit to the Ergo node
   b. Calculate PPLNS distribution
   c. Record in block_rewards
```

### When a User Visits the Dashboard

```
1. Browser -> HTTPS -> nginx
2. nginx serves the React build
3. React calls /api/*
4. nginx forwards to API (port 4000)
5. API reads PostgreSQL
6. JSON response -> React -> Display
```

## Key Files

| File | Role |
|------|------|
| `src/index.ts` | Entry point, starts everything |
| `src/config.ts` | Configuration (ports, DB, etc.) |
| `src/stratum/server.ts` | Main Stratum server |
| `src/stratum/session.ts` | Miner session management + vardiff |
| `src/ergo/autolykos2.ts` | PoW validation |
| `src/ergo/node.ts` | Ergo node API client |
| `src/db/database.ts` | PostgreSQL queries |
| `src/db/maintenance.ts` | Periodic tasks |
| `src/payout/pplns.ts` | PPLNS distribution |
| `src/payout/confirmer.ts` | Block confirmation |
| `src/payout/payer.ts` | Automatic payments |
| `src/api/api.ts` | Express REST API |

## See Also

- [Pool Internals (Visual Guide)](pool-internals.md) - Complete visual guide
- [Installing an Ergo Node](node-setup.md)
- [Database Structure](database.md)
- [Deployment](deployment.md)
