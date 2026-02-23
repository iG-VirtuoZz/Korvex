import net from "net";
import crypto from "crypto";
import { xmrConfig } from "../config";
import { daemon } from "../monero/daemon";
import { xmrDatabase } from "../db/database";
import { XmrMinerSession } from "./session";
import { validateShare, insertNonce, diffToTargetHex } from "../monero/randomx";
import { distributeXmrPPLNS } from "../payout/pplns";

// Validation adresse Monero standard (95 chars, commence par 4)
// ou adresse integree (106 chars, commence par 4)
function isValidMoneroAddress(address: string): boolean {
  if (!address) return false;
  // Adresse standard : 95 chars, commence par 4 ou 8 (sous-adresse)
  // Adresse integree : 106 chars, commence par 4
  if (address.length === 95 && (address.startsWith("4") || address.startsWith("8"))) return true;
  if (address.length === 106 && address.startsWith("4")) return true;
  // Verifier que c'est du base58 Monero valide
  return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(address);
}

interface JobEntry {
  jobId: string;
  height: number;
  difficulty: number;
  blockTemplateBlob: string;
  blockHashingBlob: string;
  seedHash: string;
  expectedReward: number;
  prevHash: string;
  submittedNonces: Set<string>;
}

interface InvalidShareEntry {
  count: number;
  lastSeen: number;
}

export class XmrStratumServer {
  private server: net.Server;
  private sessions: Map<string, XmrMinerSession> = new Map();
  private currentJob: JobEntry | null = null;
  private currentJobCounter: number = 0;
  private validJobs: Map<string, JobEntry> = new Map();
  // Map jobId envoye au mineur -> jobId interne (pour retrouver le template)
  private jobIdToTemplate: Map<string, string> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private lastNetworkDifficulty: number = 0;
  private lastHeight: number = 0;

  // Diagnostic
  private totalSharesProcessed: number = 0;
  private blockCandidatesDetected: number = 0;

  // Dice rolls (100 dernieres shares)
  private diceRolls: Array<{
    timestamp: string;
    worker: string;
    address: string;
    ratio: number;
    isBlock: boolean;
    height: number;
    vardiff: number;
  }> = [];

  private connectionCounts: Map<string, number> = new Map();
  private maxConnectionsPerIP: number = 10;
  private invalidShareCounts: Map<string, InvalidShareEntry> = new Map();
  private maxInvalidShares: number = 50;
  private invalidShareTTL: number = 3600_000;
  private maxValidJobs: number = 10;

  constructor() {
    this.server = net.createServer((socket) => this.handleConnection(socket));
  }

  async start() {
    const synced = await daemon.isSynced();
    if (!synced) {
      console.log("[XMR Stratum] Daemon pas encore synchronise, attente...");
      const waitSync = setInterval(async () => {
        const s = await daemon.isSynced();
        if (s) {
          clearInterval(waitSync);
          console.log("[XMR Stratum] Daemon synchronise, demarrage du serveur");
          this.startListening();
        }
      }, 30_000);
      return;
    }
    this.startListening();
  }

  private startListening() {
    this.server.listen(xmrConfig.stratum.port, "0.0.0.0", () => {
      console.log("[XMR Stratum] PPLNS ecoute sur le port " + xmrConfig.stratum.port);
    });
    this.pollTimer = setInterval(() => this.pollWork(), 2000);
    this.pollWork();

    // Purge compteurs invalides
    setInterval(() => this.purgeInvalidShareCounts(), this.invalidShareTTL);
  }

  private purgeInvalidShareCounts() {
    const now = Date.now();
    for (const [ip, entry] of this.invalidShareCounts) {
      if (now - entry.lastSeen > this.invalidShareTTL) {
        this.invalidShareCounts.delete(ip);
      }
    }
  }

  private getInvalidCount(ip: string): number {
    return this.invalidShareCounts.get(ip)?.count || 0;
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

  private handleConnection(socket: net.Socket) {
    const ip = socket.remoteAddress || "unknown";

    const count = (this.connectionCounts.get(ip) || 0) + 1;
    this.connectionCounts.set(ip, count);
    if (count > this.maxConnectionsPerIP) {
      socket.destroy();
      return;
    }

    const session = new XmrMinerSession(socket);
    this.sessions.set(session.sessionId, session);

    console.log("[XMR Stratum] Nouvelle connexion: " + ip + " (" + this.sessions.size + " total)");

    session.onMessage = (data: any) => {
      this.handleMessage(session, data);
    };

    session.onDifficultyChanged = () => {
      if (this.currentJob && session.authorized) {
        this.sendJobToSession(session);
      }
    };

    session.onDisconnect = () => {
      this.sessions.delete(session.sessionId);
      const c = (this.connectionCounts.get(ip) || 1) - 1;
      if (c <= 0) this.connectionCounts.delete(ip);
      else this.connectionCounts.set(ip, c);
    };
  }

  private handleMessage(session: XmrMinerSession, data: any) {
    const method = data.method;
    const params = data.params || {};
    const id = data.id;

    switch (method) {
      case "login":
        this.handleLogin(session, params, id);
        break;
      case "submit":
        this.handleSubmit(session, params, id);
        break;
      case "keepalived":
        session.sendResult(id, { status: "KEEPALIVED" });
        break;
      default:
        session.sendResult(id, null, "Unknown method: " + method);
    }
  }

  private handleLogin(session: XmrMinerSession, params: any, id: number | string | null) {
    const login = params.login || "";
    const agent = params.agent || "";

    // Parser login : ADDRESS.WORKER ou ADDRESS
    const parts = login.split(".");
    session.address = parts[0] || "";
    const rawWorker = parts.slice(1).join(".") || "default";
    session.worker = rawWorker.replace(/[^a-zA-Z0-9_\-]/g, "").substring(0, 32) || "default";
    session.agent = agent;

    // Valider l'adresse Monero
    if (!isValidMoneroAddress(session.address)) {
      session.sendResult(id, null, "Invalid Monero address");
      session.disconnect();
      return;
    }

    session.authorized = true;
    console.log("[XMR Stratum] Login: " + session.address.substring(0, 12) + "..." + session.worker + " agent=" + agent);

    // Repondre avec le job actuel
    if (this.currentJob) {
      const targetHex = diffToTargetHex(session.difficulty);
      session.lastSentDifficulty = session.difficulty;

      const perMinerJobId = this.generateJobId();
      session.lastJobId = perMinerJobId;
      // Lier le jobId du mineur au template interne
      this.jobIdToTemplate.set(perMinerJobId, this.currentJob.jobId);

      session.sendResult(id, {
        id: session.sessionId,
        job: {
          blob: this.currentJob.blockHashingBlob,
          job_id: perMinerJobId,
          target: targetHex,
          height: this.currentJob.height,
          seed_hash: this.currentJob.seedHash,
        },
        status: "OK",
      });
    } else {
      session.sendResult(id, {
        id: session.sessionId,
        status: "OK",
      });
    }
  }

  private async handleSubmit(session: XmrMinerSession, params: any, id: number | string | null) {
    if (!session.authorized) {
      session.sendResult(id, null, "Unauthenticated");
      return;
    }

    const ip = session.socket.remoteAddress || "unknown";

    if (this.getInvalidCount(ip) >= this.maxInvalidShares) {
      session.sendResult(id, null, "Too many invalid shares, banned");
      session.disconnect();
      return;
    }

    const nonceHex = params.nonce || "";
    const resultHex = params.result || ""; // Le hash precalcule par le mineur
    const jobId = params.job_id || "";

    // Trouver le job correspondant (le mineur peut soumettre pour un job precedent)
    let job: JobEntry | null = null;
    // Le jobId envoye par le mineur est un ID unique par mineur,
    // on le mappe vers le template interne via jobIdToTemplate
    const templateJobId = this.jobIdToTemplate.get(jobId);
    if (templateJobId && this.validJobs.has(templateJobId)) {
      job = this.validJobs.get(templateJobId)!;
    } else {
      // Fallback : utiliser le job courant
      job = this.currentJob;
    }
    if (!job) {
      this.incrementInvalidCount(ip);
      session.sendResult(id, null, "No active job");
      return;
    }

    // Valider le format du nonce (4 bytes = 8 hex chars)
    if (nonceHex.length !== 8 || !/^[0-9a-fA-F]+$/.test(nonceHex)) {
      this.incrementInvalidCount(ip);
      session.sendResult(id, null, "Invalid nonce format");
      await xmrDatabase.recordShare(session.address, session.worker, 0, job.difficulty, job.height, false, "pplns");
      return;
    }

    // Detection doublon
    const nonceKey = session.sessionId + ":" + nonceHex;
    if (job.submittedNonces.has(nonceKey)) {
      this.incrementInvalidCount(ip);
      session.sendResult(id, null, "Duplicate share");
      await xmrDatabase.recordShare(session.address, session.worker, 0, job.difficulty, job.height, false, "pplns");
      return;
    }
    job.submittedNonces.add(nonceKey);

    try {
      // Inserer le nonce dans le blob
      const blobWithNonce = insertNonce(job.blockHashingBlob, nonceHex);
      const blobBuffer = Buffer.from(blobWithNonce, "hex");
      const seedBuffer = Buffer.from(job.seedHash, "hex");

      // Valider le hash
      const result = validateShare(
        blobBuffer,
        seedBuffer,
        session.lastSentDifficulty,
        job.difficulty
      );

      if (!result.valid) {
        this.incrementInvalidCount(ip);
        session.sendResult(id, null, "Low difficulty share");
        await xmrDatabase.recordShare(session.address, session.worker, 0, job.difficulty, job.height, false, "pplns");
        return;
      }

      // Share VALIDE
      session.recordShare();
      this.totalSharesProcessed++;

      // shareDiff = la difficulte vardiff assignee au mineur
      // C'est la quantite de travail prouvee par ce share (pour le PPLNS)
      const shareDiff = session.lastSentDifficulty;
      await xmrDatabase.recordShare(session.address, session.worker, shareDiff, job.difficulty, job.height, true, "pplns");

      // Diagnostic : ratio hash/target
      // Pour Monero, approximation via diff
      const shareRatio = session.lastSentDifficulty / job.difficulty;

      // Dice Roll
      this.diceRolls.unshift({
        timestamp: new Date().toISOString(),
        worker: session.worker,
        address: session.address,
        ratio: shareRatio,
        isBlock: result.meetsNetworkTarget,
        height: job.height,
        vardiff: session.lastSentDifficulty,
      });
      if (this.diceRolls.length > 100) this.diceRolls.length = 100;

      console.log("[XMR Stratum] Share OK: " + session.address.substring(0, 12) + "..." + session.worker +
        " shareDiff=" + shareDiff + " vardiff=" + session.lastSentDifficulty + " netDiff=" + job.difficulty);

      session.sendResult(id, { status: "OK" });

      // Bloc candidat ?
      if (result.meetsNetworkTarget) {
        this.blockCandidatesDetected++;
        console.log("[XMR Stratum] !!! BLOC TROUVE !!! Hauteur: " + job.height + " par " + session.address + "." + session.worker);

        try {
          // Reconstruire le bloc complet avec le nonce
          const fullBlob = insertNonce(job.blockTemplateBlob, nonceHex);
          const submitted = await daemon.submitBlock(fullBlob);

          if (submitted) {
            console.log("[XMR Stratum] Bloc soumis au daemon avec succes !");

            // Alerte Discord
            try {
              const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
              if (discordWebhook) {
                fetch(discordWebhook, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    embeds: [{
                      title: "BLOC XMR TROUVE !",
                      color: 16744448, // orange
                      description: `Hauteur: **${job.height}**\nRecompense: **${(job.expectedReward / 1e12).toFixed(6)} XMR**\nMineur: ${session.address.substring(0, 12)}...${session.worker}`,
                      timestamp: new Date().toISOString()
                    }]
                  })
                }).catch(() => {});
              }
            } catch {}

            // Calcul effort AVANT recordBlock
            let effortPercent: number | null = null;
            try {
              const effortFraction = await xmrDatabase.getEffortSinceLastBlock("pplns");
              effortPercent = effortFraction * 100;
              console.log("[XMR Stratum] Effort bloc " + job.height + " = " + effortPercent.toFixed(2) + "%");
            } catch (effortErr) {
              console.error("[XMR Stratum] Erreur calcul effort:", effortErr);
            }

            // Recuperer le hash du bloc
            let blockHash = "";
            for (let attempt = 0; attempt < 5; attempt++) {
              await sleep(2000);
              try {
                const header = await daemon.getBlockHeaderByHeight(job.height);
                blockHash = header.hash;
                break;
              } catch {}
            }

            if (!blockHash) {
              blockHash = "unknown_" + job.height;
            }

            await xmrDatabase.recordBlock(
              job.height, blockHash, job.expectedReward, job.difficulty,
              session.address, session.worker, effortPercent, "pplns"
            );

            // Distribution PPLNS
            try {
              await distributeXmrPPLNS(job.height, BigInt(job.expectedReward), job.difficulty);
            } catch (distErr) {
              console.error("[XMR Stratum] Erreur distribution PPLNS:", distErr);
            }
          } else {
            console.log("[XMR Stratum] Bloc rejete par le daemon");
          }
        } catch (err) {
          console.error("[XMR Stratum] Erreur soumission bloc:", err);
        }
      }
    } catch (err) {
      console.error("[XMR Stratum] Erreur validation share:", err);
      this.incrementInvalidCount(ip);
      session.sendResult(id, null, "Internal validation error");
    }
  }

  private async pollWork() {
    try {
      const info = await daemon.getInfo();
      if (!info.synchronized) return;
      if (info.difficulty > 0) this.lastNetworkDifficulty = info.difficulty;

      // Obtenir un nouveau template de bloc
      if (!xmrConfig.pool.address) {
        console.error("[XMR Stratum] XMR_POOL_ADDRESS non configure !");
        return;
      }

      const template = await daemon.getBlockTemplate(xmrConfig.pool.address);
      if (!template || !template.blockhashing_blob) return;

      // Detecter si le template a change (nouveau bloc ou nouvelles transactions)
      const heightChanged = template.height !== this.lastHeight;
      const prevHashChanged = this.currentJob && template.prev_hash !== this.currentJob.prevHash;

      if (heightChanged || prevHashChanged) {
        this.lastHeight = template.height;
        this.currentJobCounter++;

        const job: JobEntry = {
          jobId: this.currentJobCounter.toString(16),
          height: template.height,
          difficulty: template.difficulty,
          blockTemplateBlob: template.blocktemplate_blob,
          blockHashingBlob: template.blockhashing_blob,
          seedHash: template.seed_hash,
          expectedReward: template.expected_reward,
          prevHash: template.prev_hash,
          submittedNonces: new Set(),
        };

        this.currentJob = job;
        this.validJobs.set(job.jobId, job);

        if (this.validJobs.size > this.maxValidJobs) {
          const keys = Array.from(this.validJobs.keys());
          const toRemove = keys.slice(0, keys.length - this.maxValidJobs);
          for (const key of toRemove) {
            this.validJobs.delete(key);
          }
          // Nettoyer les mappings jobId mineur -> template pour les jobs supprimes
          for (const [minerJobId, templateId] of this.jobIdToTemplate) {
            if (!this.validJobs.has(templateId)) {
              this.jobIdToTemplate.delete(minerJobId);
            }
          }
        }

        console.log("[XMR Stratum] Nouveau job #" + this.currentJobCounter +
          " hauteur=" + template.height + " diff=" + template.difficulty +
          (heightChanged ? " (NEW BLOCK)" : ""));

        this.broadcastJob();
      }
    } catch (err) {
      console.error("[XMR Stratum] Erreur pollWork:", err);
    }
  }

  private broadcastJob() {
    for (const session of this.sessions.values()) {
      if (session.authorized) {
        this.sendJobToSession(session);
      }
    }
  }

  private sendJobToSession(session: XmrMinerSession) {
    if (!this.currentJob) return;

    const perMinerJobId = this.generateJobId();
    const targetHex = diffToTargetHex(session.difficulty);
    session.lastSentDifficulty = session.difficulty;

    // Lier le jobId du mineur au template interne
    this.jobIdToTemplate.set(perMinerJobId, this.currentJob.jobId);

    session.sendJob({
      blob: this.currentJob.blockHashingBlob,
      job_id: perMinerJobId,
      target: targetHex,
      height: this.currentJob.height,
      seed_hash: this.currentJob.seedHash,
    });
  }

  private generateJobId(): string {
    return crypto.randomBytes(4).toString("hex");
  }

  async stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    for (const session of this.sessions.values()) {
      session.disconnect();
    }
    this.server.close();
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  getAuthorizedMiners(): string[] {
    const miners = new Set<string>();
    for (const s of this.sessions.values()) {
      if (s.authorized) miners.add(s.address);
    }
    return Array.from(miners);
  }

  getDiceRolls() {
    return {
      rolls: this.diceRolls,
      totalShares: this.totalSharesProcessed,
      blockCandidates: this.blockCandidatesDetected,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
