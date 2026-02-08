import net from "net";
import { config } from "../config";
import { ergoNode, MiningCandidate } from "../ergo/node";
import { database } from "../db/database";
import { MinerSession, MinerType } from "./session";
import { validateShare } from "../ergo/autolykos2";
import { distributePPLNS } from "../payout/pplns";
import { distributeSolo } from "../payout/solo";

interface JobEntry {
  candidate: MiningCandidate;
  jobId: string;
  bNetwork: bigint;
  submittedNonces: Set<string>;
}

interface InvalidShareEntry {
  count: number;
  lastSeen: number;
}

// --- Idle Sweep : detection workers silencieux ---
const IDLE_SWEEP_INTERVAL = 30_000; // 30s entre chaque sweep
const IDLE_THRESHOLD_MS = 30_000;   // Worker considere idle si pas de share depuis 30s
const IDLE_DIFF_BUMP = 1.5;         // Augmenter vardiff de 50% pour rendre plus facile

export class StratumServer {
  private server: net.Server;
  private soloServer: net.Server;
  private sessions: Map<string, MinerSession> = new Map();
  private extraNonceCounter: number = 0;
  private currentJob: JobEntry | null = null;
  private currentJobId: number = 0;
  private validJobs: Map<string, JobEntry> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private invalidSharePurgeTimer: NodeJS.Timeout | null = null;
  private idleSweepTimer: NodeJS.Timeout | null = null;
  private lastNetworkDifficulty: number = 0;

  private connectionCounts: Map<string, number> = new Map();
  private maxConnectionsPerIP: number = 10;
  private invalidShareCounts: Map<string, InvalidShareEntry> = new Map();
  private maxInvalidShares: number = 50;
  private invalidShareTTL: number = 3600_000; // 1 heure
  private maxValidJobs: number = 10;

  private extraNonce2Size: number = 4;

  // Cache de la derniere diff par worker (address.worker -> {vardiff, lastSeen})
  // Permet de restaurer la diff a la reconnexion au lieu de repartir a 10000
  private workerLastDiff: Map<string, { diff: number; lastSeen: number }> = new Map();
  private workerLastDiffPurgeTimer: NodeJS.Timeout | null = null;
  private workerLastDiffTTL: number = 24 * 3600_000; // 24 heures

  constructor() {
    this.server = net.createServer((socket) => this.handleConnection(socket, 'pplns'));
    this.soloServer = net.createServer((socket) => this.handleConnection(socket, 'solo'));
  }

  async start() {
    const synced = await ergoNode.isSynced();
    if (!synced) {
      console.log("[Stratum] Node pas encore synchronise, attente...");
      const waitSync = setInterval(async () => {
        const s = await ergoNode.isSynced();
        if (s) {
          clearInterval(waitSync);
          console.log("[Stratum] Node synchronise, demarrage du serveur");
          this.startListening();
        }
      }, 30_000);
      return;
    }
    this.startListening();
  }

  private startListening() {
    this.server.listen(config.stratum.port, "0.0.0.0", () => {
      console.log("[Stratum] PPLNS ecoute sur le port " + config.stratum.port);
    });
    this.soloServer.listen(config.stratum.soloPort, "0.0.0.0", () => {
      console.log("[Stratum] SOLO ecoute sur le port " + config.stratum.soloPort);
    });
    this.pollTimer = setInterval(() => this.pollWork(), 2000);
    this.pollWork();

    // Purge periodique des compteurs de shares invalides (TTL 1h)
    this.invalidSharePurgeTimer = setInterval(() => this.purgeInvalidShareCounts(), this.invalidShareTTL);

    // Purge periodique du cache workerLastDiff (TTL 24h)
    this.workerLastDiffPurgeTimer = setInterval(() => this.purgeWorkerLastDiff(), this.workerLastDiffTTL);

    // Idle sweep : detecte les workers silencieux et baisse leur diff
    this.idleSweepTimer = setInterval(() => this.idleSweep(), IDLE_SWEEP_INTERVAL);
  }

  private purgeInvalidShareCounts() {
    const now = Date.now();
    let purged = 0;
    for (const [ip, entry] of this.invalidShareCounts) {
      if (now - entry.lastSeen > this.invalidShareTTL) {
        this.invalidShareCounts.delete(ip);
        purged++;
      }
    }
    if (purged > 0) {
      console.log("[Stratum] Purge invalidShareCounts: " + purged + " entree(s) expirees");
    }
  }

  private purgeWorkerLastDiff() {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of this.workerLastDiff) {
      if (now - entry.lastSeen > this.workerLastDiffTTL) {
        this.workerLastDiff.delete(key);
        purged++;
      }
    }
    if (purged > 0) {
      console.log("[Stratum] Purge workerLastDiff: " + purged + " entree(s) expirees");
    }
  }

  /**
   * Idle Sweep : pour chaque session autorisee sans share depuis > 30s,
   * augmenter le vardiff de 50% (rendre plus facile) pour debloquer le worker.
   */
  private idleSweep() {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (!session.authorized) continue;
      const lastShare = session.getLastShareTimestamp();
      // Pas de share du tout : le worker vient peut-etre de se connecter, ignorer
      if (lastShare === 0) continue;
      const idleMs = now - lastShare;
      if (idleMs > IDLE_THRESHOLD_MS) {
        // Augmenter le vardiff (= baisser la difficulte effective pour le mineur)
        const newDiff = Math.round(session.difficulty * IDLE_DIFF_BUMP);
        if (newDiff !== session.difficulty) {
          console.log("[IdleSweep] " + session.address.substring(0, 12) + "..." + session.worker +
            " idle " + (idleMs / 1000).toFixed(0) + "s, vardiff " + session.difficulty + " -> " + newDiff);
          session.setDifficulty(newDiff);
          session.resetShareTimestamps();
        }
      }
    }
  }

  private getInvalidCount(ip: string): number {
    const entry = this.invalidShareCounts.get(ip);
    return entry ? entry.count : 0;
  }

  private incrementInvalidCount(ip: string): void {
    const entry = this.invalidShareCounts.get(ip);
    if (entry) {
      entry.count++;
      entry.lastSeen = Date.now();
    } else {
      this.invalidShareCounts.set(ip, { count: 1, lastSeen: Date.now() });
    }
  }

  private handleConnection(socket: net.Socket, miningMode: 'pplns' | 'solo' = 'pplns') {
    const ip = socket.remoteAddress || "unknown";

    const count = (this.connectionCounts.get(ip) || 0) + 1;
    this.connectionCounts.set(ip, count);
    if (count > this.maxConnectionsPerIP) {
      socket.destroy();
      return;
    }

    const extraNonce = (this.extraNonceCounter++ % 0xFFFFFFFF).toString(16).padStart(8, "0");
    const session = new MinerSession(socket, extraNonce);
    session.miningMode = miningMode;
    const sessionId = session.subscriptionId;
    this.sessions.set(sessionId, session);

    console.log("[Stratum] Nouvelle connexion: " + ip + " (" + this.sessions.size + " total)");

    session.onMessage = (method, params, id) => {
      this.handleMessage(session, method, params, id);
    };

    // Callback vardiff : quand la diff change, re-envoyer le job avec le nouveau b
    session.onDifficultyChanged = () => {
      if (this.currentJob && session.authorized) {
        this.sendJob(session);
      }
    };

    session.onDisconnect = () => {
      // Sauvegarder la diff du worker pour la restaurer a la reconnexion
      if (session.authorized && session.address && session.difficulty > 0) {
        const workerKey = session.address + "." + session.worker;
        this.workerLastDiff.set(workerKey, { diff: session.difficulty, lastSeen: Date.now() });
      }
      this.sessions.delete(sessionId);
      const c = (this.connectionCounts.get(ip) || 1) - 1;
      if (c <= 0) this.connectionCounts.delete(ip);
      else this.connectionCounts.set(ip, c);
    };
  }

  private handleMessage(session: MinerSession, method: string, params: any[], id: number | null) {
    switch (method) {
      case "mining.subscribe":
        // Detecter le type de mineur via user-agent (params[0])
        const userAgent = (params[0] || "").toLowerCase();
        session.userAgent = params[0] || "";
        if (userAgent.includes("srbminer")) {
          session.minerType = "srbminer";
        } else if (userAgent.includes("lolminer")) {
          session.minerType = "lolminer";
        } else if (userAgent.includes("teamredminer")) {
          session.minerType = "teamredminer";
        }
        console.log("[Stratum] Subscribe: " + (session.userAgent || "no user-agent") + " -> minerType=" + session.minerType);

        session.sendResult(id, [
          [
            ["mining.set_difficulty", session.subscriptionId],
            ["mining.notify", session.subscriptionId],
          ],
          session.extraNonce,
          this.extraNonce2Size,
        ]);
        // Envoyer set_difficulty(1) - tous les mineurs utilisent le b pre-multiplie
        session.sendNotify("mining.set_difficulty", [1]);
        break;

      case "mining.authorize":
        this.handleAuthorize(session, params, id);
        break;

      case "mining.submit":
        this.handleSubmit(session, params, id);
        break;

      case "mining.extranonce.subscribe":
        session.sendResult(id, true);
        break;

      default:
        session.sendResult(id, null, "Methode inconnue");
    }
  }

  private handleAuthorize(session: MinerSession, params: any[], id: number | null) {
    const [fullAddress] = params;
    const parts = (fullAddress || "").split(".");
    session.address = parts[0] || "";
    // Sanitiser le worker name : alphanumerique, underscore, tiret, max 32 chars
    const rawWorker = parts[1] || "default";
    session.worker = rawWorker.replace(/[^a-zA-Z0-9_\-]/g, "").substring(0, 32) || "default";

    // Validation adresse Ergo mainnet : commence par '9', base58, 40-55 chars
    if (!session.address || session.address.length < 40 || session.address.length > 55 || !session.address.startsWith("9")) {
      session.sendResult(id, false, "Adresse ERGO invalide");
      session.disconnect();
      return;
    }
    // Verifier que l'adresse est du base58 valide (pas de 0, O, I, l)
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(session.address)) {
      session.sendResult(id, false, "Adresse ERGO invalide (caracteres non-base58)");
      session.disconnect();
      return;
    }
    session.authorized = true;
    session.sendResult(id, true);

    // Restaurer la derniere diff connue pour ce worker (evite le burst post-restart)
    const workerKey = session.address + "." + session.worker;
    const lastDiffEntry = this.workerLastDiff.get(workerKey);
    if (lastDiffEntry && lastDiffEntry.diff >= 100) {
      session.setDifficulty(lastDiffEntry.diff);
      session.markBootstrapped(); // Worker connu : pas besoin de bootstrap
      console.log("[Stratum] Mineur autorise: " + session.address.substring(0, 12) + "..." + session.worker + " (vardiff restaure: " + lastDiffEntry.diff + ")");
    } else {
      session.markAuthorized(); // Nouveau worker : activer le bootstrap
      console.log("[Stratum] Mineur autorise: " + session.address.substring(0, 12) + "..." + session.worker + " (vardiff initial: " + session.difficulty + ", bootstrap actif)");
    }

    if (this.currentJob) {
      this.sendJob(session);
    }
  }

  private async handleSubmit(session: MinerSession, params: any[], id: number | null) {
    if (!session.authorized) {
      session.sendResult(id, false, "Non autorise");
      return;
    }

    const ip = session.socket.remoteAddress || "unknown";

    const invalidCount = this.getInvalidCount(ip);
    if (invalidCount >= this.maxInvalidShares) {
      session.sendResult(id, false, "Trop de shares invalides, banni");
      session.disconnect();
      return;
    }

    const workerName = params[0] || "";
    const jobIdHex = params[1] || "";
    const extraNonce2 = params[2] || "";

    const job = this.validJobs.get(jobIdHex);
    if (!job) {
      this.incrementInvalidCount(ip);
      session.sendResult(id, false, "Job introuvable");
      await database.recordShare(session.address, session.worker, 0, 0, 0, false, session.miningMode);
      return;
    }

    if (extraNonce2.length !== this.extraNonce2Size * 2 || !/^[0-9a-fA-F]+$/.test(extraNonce2)) {
      this.incrementInvalidCount(ip);
      session.sendResult(id, false, "extraNonce2 invalide");
      await database.recordShare(session.address, session.worker, 0, 0, job.candidate.h, false, session.miningMode);
      return;
    }

    const fullNonceHex = session.extraNonce + extraNonce2;
    if (fullNonceHex.length !== 16) {
      this.incrementInvalidCount(ip);
      session.sendResult(id, false, "Taille nonce incorrecte");
      await database.recordShare(session.address, session.worker, 0, 0, job.candidate.h, false, session.miningMode);
      return;
    }

    if (job.submittedNonces.has(fullNonceHex)) {
      this.incrementInvalidCount(ip);
      session.sendResult(id, false, "Share duplique");
      await database.recordShare(session.address, session.worker, 0, 0, job.candidate.h, false, session.miningMode);
      return;
    }
    job.submittedNonces.add(fullNonceHex);
    const msg = Buffer.from(job.candidate.msg, "hex");
    const nonce = Buffer.from(fullNonceHex, "hex");
    const height = job.candidate.h;

    try {
      // bShareTarget = bNetwork * vardiff (pre-multiplie, identique a ce que le mineur a recu)
      const bShareTarget = job.bNetwork * BigInt(session.difficulty);
      const result = validateShare(msg, nonce, height, bShareTarget, job.bNetwork);

      if (!result.valid) {
        this.incrementInvalidCount(ip);
        session.sendResult(id, false, "Low difficulty share");
        await database.recordShare(session.address, session.worker, 0, this.lastNetworkDifficulty, height, false, session.miningMode);
        return;
      }

      // Share VALIDE
      session.recordShare();

      // shareDiff = travail absolu prouve par le share
      // Avec multiplyDifficulty: bShare = bNetwork * vardiff, donc le mineur
      // mine a une target vardiff fois plus facile que le reseau.
      // Le travail absolu = networkDiff / vardiff
      const shareDiff = Math.round(this.lastNetworkDifficulty / session.difficulty);
      await database.recordShare(session.address, session.worker, shareDiff, this.lastNetworkDifficulty, height, true, session.miningMode);
      console.log("[Stratum] Share OK: " + session.address.substring(0, 12) + "..." + session.worker + " shareDiff=" + shareDiff + " vardiff=" + session.difficulty + " netDiff=" + this.lastNetworkDifficulty);
      session.sendResult(id, true);

      // Bloc candidat ?
      if (result.meetsNetworkTarget) {
        console.log("[Stratum] !!! BLOC TROUVE !!! Hauteur: " + height + " par " + session.address + "." + session.worker);
        try {
          const solution = {
            pk: job.candidate.pk,
            w: "0350e25cee8562697d55275c96bb01b34228f9bd68fd9933f2a25ff195526864f5",
            n: fullNonceHex,
            d: 0,
          };
          const submitted = await ergoNode.submitSolution(solution);
          if (submitted) {
            console.log("[Stratum] Bloc soumis au noeud avec succes !");

            // TODO: TEMPORAIRE - Alerte Discord bloc trouve (a enlever avant public)
            try {
              const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
              if (discordWebhook) {
                fetch(discordWebhook, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    embeds: [{
                      title: "🎉 BLOC TROUVÉ !",
                      color: 65280,
                      description: `Hauteur: **${height}**\nMode: **${session.miningMode.toUpperCase()}**\nMineur: ${session.address.substring(0, 12)}...${session.worker}`,
                      timestamp: new Date().toISOString()
                    }]
                  })
                }).catch(() => {});
              }
            } catch {}


            // --- Calcul effort lisse AVANT recordBlock ---
            let effortPercent: number | null = null;
            try {
              if (session.miningMode === 'solo') {
                const effortFraction = await database.getEffortForMinerSolo(session.address);
                effortPercent = effortFraction * 100;
              } else {
                const effortFraction = await database.getEffortSinceLastBlock('pplns');
                effortPercent = effortFraction * 100;
              }
              console.log("[Stratum] Effort bloc " + height + " = " + effortPercent.toFixed(2) + "% (" + session.miningMode.toUpperCase() + ")");
            } catch (effortErr) {
              console.error("[Stratum] Erreur calcul effort:", effortErr);
            }

            let blockId = "";
            for (let attempt = 0; attempt < 5; attempt++) {
              await sleep(2000);
              const blockIds = await ergoNode.getBlockIdsAtHeight(height);
              if (blockIds.length > 0) {
                blockId = blockIds[0];
                break;
              }
            }

            if (!blockId) {
              console.error("[Stratum] Impossible de recuperer le blockId pour hauteur " + height);
              blockId = "unknown_" + height;
            } else {
              console.log("[Stratum] BlockId recupere: " + blockId);
            }

            await database.recordBlock(height, blockId, 0, this.lastNetworkDifficulty, session.address, session.worker, effortPercent, session.miningMode);

            // --- Distribution conditionnelle ---
            try {
              const rewardNano = await ergoNode.getEmissionReward(height);
              console.log("[Stratum] Reward bloc " + height + " = " + (Number(rewardNano) / 1e9) + " ERG (" + session.miningMode.toUpperCase() + ")");
              if (session.miningMode === 'solo') {
                await distributeSolo(height, rewardNano, session.address);
              } else {
                await distributePPLNS(height, rewardNano, this.lastNetworkDifficulty);
              }
            } catch (distErr) {
              console.error("[Stratum] Erreur distribution:", distErr);
            }
          } else {
            console.log("[Stratum] Bloc rejete par le noeud");
          }
        } catch (err) {
          console.error("[Stratum] Erreur soumission bloc:", err);
        }
      }

    } catch (err) {
      console.error("[Stratum] Erreur validation share:", err);
      session.sendResult(id, false, "Erreur interne validation");
    }
  }

  private async pollWork() {
    try {
      const synced = await ergoNode.isSynced();
      if (!synced) return;

      const netDiff = await ergoNode.getNetworkDifficulty();
      if (netDiff > 0) this.lastNetworkDifficulty = netDiff;

      const candidate = await ergoNode.getMiningCandidate();
      if (!candidate || !candidate.msg) return;

      const currentMsg = this.currentJob?.candidate.msg;
      if (!currentMsg || currentMsg !== candidate.msg) {
        this.currentJobId++;
        const jobIdHex = this.currentJobId.toString(16);

        const bNetwork = BigInt(candidate.b);

        const job: JobEntry = {
          candidate,
          jobId: jobIdHex,
          bNetwork,
          submittedNonces: new Set(),
        };

        this.currentJob = job;
        this.validJobs.set(jobIdHex, job);

        if (this.validJobs.size > this.maxValidJobs) {
          const keys = Array.from(this.validJobs.keys());
          for (let i = 0; i < keys.length - this.maxValidJobs; i++) {
            this.validJobs.delete(keys[i]);
          }
        }

        console.log("[Stratum] Nouveau job #" + this.currentJobId + " hauteur=" + candidate.h);
        this.broadcastJob();
      }
    } catch (err) {
      console.error("[Stratum] Erreur pollWork:", err);
    }
  }

  private broadcastJob() {
    for (const session of this.sessions.values()) {
      if (session.authorized) {
        this.sendJob(session);
      }
    }
  }

  private sendJob(session: MinerSession) {
    if (!this.currentJob) return;

    // Tous les mineurs: envoyer bShare pre-multiplie (bNetwork * vardiff)
    // C'est le comportement standard qui fonctionne avec lolMiner/TeamRedMiner
    const bShare = this.currentJob.bNetwork * BigInt(session.difficulty);

    session.sendNotify("mining.notify", [
      this.currentJob.jobId,
      this.currentJob.candidate.h,
      this.currentJob.candidate.msg,
      "",
      "",
      "00000002",
      bShare.toString(),
      "",
      false,
    ]);
  }

  async stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.invalidSharePurgeTimer) clearInterval(this.invalidSharePurgeTimer);
    if (this.workerLastDiffPurgeTimer) clearInterval(this.workerLastDiffPurgeTimer);
    if (this.idleSweepTimer) clearInterval(this.idleSweepTimer);
    for (const session of this.sessions.values()) {
      session.disconnect();
    }
    this.server.close();
    this.soloServer.close();
  }

  getSessionCount(miningMode?: string): number {
    if (!miningMode) return this.sessions.size;
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.miningMode === miningMode) count++;
    }
    return count;
  }

  getAuthorizedMiners(miningMode?: string): string[] {
    const miners = new Set<string>();
    for (const s of this.sessions.values()) {
      if (s.authorized && (!miningMode || s.miningMode === miningMode)) {
        miners.add(s.address);
      }
    }
    return Array.from(miners);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
