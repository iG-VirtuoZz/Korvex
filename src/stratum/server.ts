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

// --- Idle Sweep: silent worker detection ---
const IDLE_SWEEP_INTERVAL = 30_000; // 30s between each sweep
const IDLE_THRESHOLD_MS = 30_000;   // Worker considered idle if no share for 30s
const IDLE_DIFF_BUMP = 1.5;         // Increase vardiff by 50% to make it easier

export class StratumServer {
  private server: net.Server;
  private soloServer: net.Server;
  private sessions: Map<string, MinerSession> = new Map();
  private extraNonceCounter: number = 1;
  private currentJob: JobEntry | null = null;
  private currentJobId: number = 0;
  private validJobs: Map<string, JobEntry> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private invalidSharePurgeTimer: NodeJS.Timeout | null = null;
  private idleSweepTimer: NodeJS.Timeout | null = null;
  private lastNetworkDifficulty: number = 0;

  // Diagnostic: track the best fh/b ratio to see how close we get to blocks
  private bestShareRatio: number = Infinity; // Smaller = closer to a block
  private totalSharesProcessed: number = 0;
  private blockCandidatesDetected: number = 0;

  // Dice Rolls: last 100 shares with their fh/b ratio (casino style)
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
  private invalidShareTTL: number = 3600_000; // 1 hour
  private maxValidJobs: number = 10;

  private extraNonce2Size: number = 6;

  // Cache of last diff per worker (address.worker -> {vardiff, lastSeen})
  // Allows restoring the diff on reconnection instead of starting over at 10000
  private workerLastDiff: Map<string, { diff: number; lastSeen: number }> = new Map();
  private workerLastDiffPurgeTimer: NodeJS.Timeout | null = null;
  private workerLastDiffTTL: number = 24 * 3600_000; // 24 hours

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

    // Periodic purge of invalid share counters (TTL 1h)
    this.invalidSharePurgeTimer = setInterval(() => this.purgeInvalidShareCounts(), this.invalidShareTTL);

    // Periodic purge of workerLastDiff cache (TTL 24h)
    this.workerLastDiffPurgeTimer = setInterval(() => this.purgeWorkerLastDiff(), this.workerLastDiffTTL);

    // Idle sweep: detects silent workers and lowers their diff
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
   * Idle Sweep disabled.
   * The old code increased vardiff for idle workers, but with multiplyDifficulty
   * (bShare = bNetwork * vardiff), a vardiff too high makes b so large that
   * lolMiner can no longer find a solution and disconnects in a loop.
   * The normal vardiff is sufficient to adapt via share timestamps.
   */
  private idleSweep() {
    // Disabled - standard vardiff already handles adjustments
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

    const extraNonce = (this.extraNonceCounter++ % 0xFFFF).toString(16).padStart(4, "0");
    const session = new MinerSession(socket, extraNonce);
    session.miningMode = miningMode;
    const sessionId = session.subscriptionId;
    this.sessions.set(sessionId, session);

    console.log("[Stratum] Nouvelle connexion: " + ip + " (" + this.sessions.size + " total)");

    session.onMessage = (method, params, id) => {
      this.handleMessage(session, method, params, id);
    };

    // Vardiff callback: when diff changes, re-send the job with the new b
    session.onDifficultyChanged = () => {
      if (this.currentJob && session.authorized) {
        this.sendJob(session);
      }
    };

    session.onDisconnect = () => {
      // Save the worker's diff to restore it on reconnection
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
        // Detect miner type via user-agent (params[0])
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
        // Send set_difficulty(1) - all miners use the pre-multiplied b
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
    // Sanitize worker name: alphanumeric, underscore, hyphen, max 32 chars
    const rawWorker = parts[1] || "default";
    session.worker = rawWorker.replace(/[^a-zA-Z0-9_\-]/g, "").substring(0, 32) || "default";

    // Ergo mainnet address validation: starts with '9', base58, 40-55 chars
    if (!session.address || session.address.length < 40 || session.address.length > 55 || !session.address.startsWith("9")) {
      session.sendResult(id, false, "Adresse ERGO invalide");
      session.disconnect();
      return;
    }
    // Verify the address is valid base58 (no 0, O, I, l)
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(session.address)) {
      session.sendResult(id, false, "Adresse ERGO invalide (caracteres non-base58)");
      session.disconnect();
      return;
    }
    session.authorized = true;
    session.sendResult(id, true);

    // Always use bootstrap — restoring cached vardiff caused
    // bShare values too large with inflated vardiffs, making miners unable
    // to find solutions (reconnection loops in lolMiner/TeamRedMiner)
    session.markAuthorized();
    console.log("[Stratum] Mineur autorise: " + session.address.substring(0, 12) + "..." + session.worker + " (vardiff: " + session.difficulty + ")");

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
      // bShareTarget = bNetwork * vardiff sent to the miner (not the internal vardiff which may have changed)
      // The miner mines with the bShare received in mining.notify, we must validate with the same
      const bShareTarget = job.bNetwork * BigInt(session.lastSentDifficulty);
      const result = validateShare(msg, nonce, height, bShareTarget, job.bNetwork);

      if (!result.valid) {
        this.incrementInvalidCount(ip);
        session.sendResult(id, false, "Low difficulty share");
        await database.recordShare(session.address, session.worker, 0, this.lastNetworkDifficulty, height, false, session.miningMode);
        return;
      }

      // VALID share
      session.recordShare();
      this.totalSharesProcessed++;

      // Diagnostic: fh/bNetwork ratio — smaller = closer to a block (< 1.0 = block!)
      const shareRatio = Number(result.fh) / Number(job.bNetwork);
      if (shareRatio < this.bestShareRatio) {
        this.bestShareRatio = shareRatio;
        console.log("[Stratum] BEST SHARE: ratio=" + shareRatio.toExponential(4) + " (fh/b, <1.0 = bloc) total=" + this.totalSharesProcessed + " shares");
      }

      // Dice Roll: store for the admin panel
      this.diceRolls.unshift({
        timestamp: new Date().toISOString(),
        worker: session.worker,
        address: session.address,
        ratio: shareRatio,
        isBlock: result.meetsNetworkTarget,
        height,
        vardiff: session.lastSentDifficulty,
      });
      if (this.diceRolls.length > 100) this.diceRolls.length = 100;

      // shareDiff = absolute work proven by the share
      // With multiplyDifficulty: bShare = bNetwork * vardiff, so the miner
      // mines at a target vardiff times easier than the network.
      // Absolute work = networkDiff / vardiff (use the sent vardiff)
      const shareDiff = Math.round(this.lastNetworkDifficulty / session.lastSentDifficulty);
      await database.recordShare(session.address, session.worker, shareDiff, this.lastNetworkDifficulty, height, true, session.miningMode);
      console.log("[Stratum] Share OK: " + session.address.substring(0, 12) + "..." + session.worker + " shareDiff=" + shareDiff + " vardiff=" + session.lastSentDifficulty + " netDiff=" + this.lastNetworkDifficulty);
      session.sendResult(id, true);

      // Block candidate?
      if (result.meetsNetworkTarget) {
        this.blockCandidatesDetected++;
        console.log("[Stratum] !!! BLOC TROUVE !!! Hauteur: " + height + " par " + session.address + "." + session.worker + " (candidat #" + this.blockCandidatesDetected + ", ratio fh/b=" + shareRatio.toExponential(6) + ")");
        try {
          const solution = {
            pk: job.candidate.pk,
            w: "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
            n: fullNonceHex,
            d: 0,
          };
          console.log("[Stratum] Soumission solution: pk=" + solution.pk.substring(0, 16) + "... n=" + solution.n + " d=" + solution.d);
          const submitted = await ergoNode.submitSolution(solution);
          console.log("[Stratum] Reponse noeud submitSolution: " + submitted);
          if (submitted) {
            console.log("[Stratum] Bloc soumis au noeud avec succes !");

            // TODO: TEMPORARY - Discord block found alert (remove before public)
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


            // --- Smoothed effort calculation BEFORE recordBlock ---
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

            // --- Conditional distribution ---
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
      // Single getInfo() call instead of isSynced() + getNetworkDifficulty() (saves 1 HTTP/2s)
      const info = await ergoNode.getInfo();
      if (!info.headersHeight || !info.fullHeight || (info.headersHeight - info.fullHeight) >= 5) return;
      if (info.difficulty > 0) this.lastNetworkDifficulty = info.difficulty;

      const candidate = await ergoNode.getMiningCandidate();
      if (!candidate || !candidate.msg) return;

      const currentMsg = this.currentJob?.candidate.msg;
      if (!currentMsg || currentMsg !== candidate.msg) {
        // Detect if height changed (= new network block)
        const heightChanged = !this.currentJob || this.currentJob.candidate.h !== candidate.h;

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

        console.log("[Stratum] Nouveau job #" + this.currentJobId + " hauteur=" + candidate.h + (heightChanged ? " (NEW BLOCK)" : ""));
        this.broadcastJob(false);
      }
    } catch (err) {
      console.error("[Stratum] Erreur pollWork:", err);
    }
  }

  private broadcastJob(cleanJobs: boolean = false) {
    for (const session of this.sessions.values()) {
      if (session.authorized) {
        this.sendJob(session, cleanJobs);
      }
    }
  }

  private sendJob(session: MinerSession, cleanJobs: boolean = false) {
    if (!this.currentJob) return;

    // All miners: send pre-multiplied bShare (bNetwork * vardiff)
    // This is the standard behavior that works with lolMiner/TeamRedMiner
    const bShare = this.currentJob.bNetwork * BigInt(session.difficulty);

    // Save the sent vardiff — for share validation
    // The miner mines with THIS bShare, not one from a vardiff that may have changed since
    session.lastSentDifficulty = session.difficulty;

    // clean_jobs = true when height changes (new network block)
    // Miners must abandon their current work on the old block
    session.sendNotify("mining.notify", [
      this.currentJob.jobId,
      this.currentJob.candidate.h,
      this.currentJob.candidate.msg,
      "",
      "",
      "00000002",
      bShare.toString(),
      "",
      cleanJobs,
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

  getDiceRolls() {
    return {
      rolls: this.diceRolls,
      bestRatio: this.bestShareRatio === Infinity ? null : this.bestShareRatio,
      totalShares: this.totalSharesProcessed,
      blockCandidates: this.blockCandidatesDetected,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
