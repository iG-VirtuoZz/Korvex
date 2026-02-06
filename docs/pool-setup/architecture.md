# Architecture de la Pool KORVEX

## Vue d'ensemble

```
                    ┌─────────────────────────────────────────┐
                    │              VPS (Ubuntu)               │
                    │                                         │
┌──────────┐        │  ┌─────────────┐    ┌──────────────┐   │
│  Mineur  │◄──────►│  │  Stratum    │◄──►│  Noeud Ergo  │   │
│  (GPU)   │  TCP   │  │  Server     │    │  (port 9053) │   │
└──────────┘  3416  │  │  (port 3416)│    └──────────────┘   │
                    │  └──────┬──────┘                        │
                    │         │                               │
                    │         ▼                               │
                    │  ┌─────────────┐    ┌──────────────┐   │
                    │  │   API       │◄──►│  PostgreSQL  │   │
┌──────────┐        │  │  (port 4000)│    │  (port 5432) │   │
│ Frontend │◄──────►│  └─────────────┘    └──────────────┘   │
│ (React)  │  HTTPS │                                         │
└──────────┘        │  ┌─────────────┐                        │
                    │  │   nginx     │                        │
                    │  │  (reverse   │                        │
                    │  │   proxy)    │                        │
                    │  └─────────────┘                        │
                    └─────────────────────────────────────────┘
```

## Les composants

### 1. Noeud Ergo

Le noeud Ergo est le **lien avec la blockchain**. Il :
- Synchronise la blockchain complete
- Fournit les candidats de blocs a miner
- Recoit les solutions trouvees
- Gere le wallet de la pool

**Port** : 9053 (API REST, bind sur 127.0.0.1 uniquement)
**Config** : `/home/ergo/node/ergo.conf`

### 2. Stratum Server

Le serveur Stratum **communique avec les mineurs**. Il :
- Accepte les connexions TCP des mineurs
- Envoie les jobs (mining.notify)
- Recoit et valide les shares
- Gere le vardiff par session
- Soumet les blocs trouves au noeud

**Port** : 3416 (TCP, ouvert au public)
**Code** : `src/stratum/server.ts`, `src/stratum/session.ts`

### 3. API REST

L'API fournit les **donnees pour le dashboard**. Elle :
- Expose les stats de la pool (hashrate, blocs, mineurs)
- Permet aux mineurs de voir leur balance
- Fournit les donnees pour les graphiques

**Port** : 4000 (HTTP, bind sur 127.0.0.1)
**Code** : `src/api/api.ts`

### 4. PostgreSQL

La base de donnees **stocke tout** :
- Les shares soumises
- Les blocs trouves
- Les balances des mineurs
- L'historique des paiements
- Les agregations hashrate

**Port** : 5432 (local uniquement)
**Code** : `src/db/database.ts`

### 5. Frontend React

Le dashboard web **affiche les infos** :
- Stats temps reel
- Graphiques hashrate et difficulte
- Page mineur avec balance et workers
- Calculateur de rentabilite

**Build** : `/home/ergo/pool/frontend/build/`
**Code** : `frontend/src/`

### 6. nginx

Le reverse proxy **expose le tout** :
- HTTPS pour le frontend et l'API
- Certificat Let's Encrypt
- Redirection HTTP → HTTPS

## Flux de donnees

### Quand un mineur soumet une share

```
1. Mineur → TCP → Stratum Server
2. Server valide le hash (autolykos2.ts)
3. Server enregistre dans PostgreSQL (database.ts)
4. Si bloc trouve :
   a. Soumettre au noeud Ergo
   b. Calculer distribution PPLNS
   c. Enregistrer dans block_rewards
```

### Quand un utilisateur visite le dashboard

```
1. Browser → HTTPS → nginx
2. nginx sert le build React
3. React appelle /api/*
4. nginx forward vers API (port 4000)
5. API lit PostgreSQL
6. Reponse JSON → React → Affichage
```

## Fichiers cles

| Fichier | Role |
|---------|------|
| `src/index.ts` | Point d'entree, demarre tout |
| `src/config.ts` | Configuration (ports, DB, etc.) |
| `src/stratum/server.ts` | Serveur Stratum principal |
| `src/stratum/session.ts` | Gestion session mineur + vardiff |
| `src/ergo/autolykos2.ts` | Validation PoW |
| `src/ergo/node.ts` | Client API noeud Ergo |
| `src/db/database.ts` | Requetes PostgreSQL |
| `src/db/maintenance.ts` | Taches periodiques |
| `src/payout/pplns.ts` | Distribution PPLNS |
| `src/payout/confirmer.ts` | Confirmation blocs |
| `src/payout/payer.ts` | Paiements automatiques |
| `src/api/api.ts` | API REST Express |

## Voir aussi

- [Fonctionnement interne (tableaux)](pool-internals.md) - Guide visuel complet
- [Installer un noeud Ergo](node-setup.md)
- [Structure base de donnees](database.md)
- [Deploiement](deployment.md)
