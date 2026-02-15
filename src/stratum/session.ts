import net from "net";
import crypto from "crypto";

interface VardiffConfig {
  targetShareTime: number; // seconds between each share
  minDiff: number;
  maxDiff: number;
  retargetTime: number; // seconds before recalculation
  variancePercent: number;
}

// multiplyDifficulty model: vardiff directly controls the b sent to the miner
// bShare = bNetwork * vardiff (sent in mining.notify params[6])
// mining.set_difficulty always sends 1 (neutral, Ergo miners ignore it)
const VARDIFF_CONFIG: VardiffConfig = {
  targetShareTime: 15,
  minDiff: 100,        // Floor: supports up to ~200 GH/s
  maxDiff: 500000,     // Ceiling: supports down to ~40 MH/s
  retargetTime: 90,    // 90s between adjustments (more stable)
  variancePercent: 30, // 30% tolerance before adjustment (wider dead zone)
};

const DEFAULT_INITIAL_DIFF = 20000; // Average initial diff

// Change limit per retarget: max x1.25 or /1.25 (anti-oscillation)
const MAX_DIFF_CHANGE_RATIO = 1.25;

// Miner type detected via user-agent in mining.subscribe
// Some miners (SRBMiner) interpret set_difficulty differently
export type MinerType = "lolminer" | "teamredminer" | "srbminer" | "unknown";

export class MinerSession {
  public socket: net.Socket;
  public address: string = "";
  public worker: string = "default";
  public authorized: boolean = false;
  public difficulty: number = DEFAULT_INITIAL_DIFF;
  public subscriptionId: string;
  public extraNonce: string;
  public miningMode: 'pplns' | 'solo' = 'pplns';
  public minerType: MinerType = "unknown";
  public userAgent: string = "";

  // Vardiff sent to the miner with the last mining.notify
  // Used for share validation (the miner mines with THIS bShare)
  public lastSentDifficulty: number = DEFAULT_INITIAL_DIFF;

  // Callback called when vardiff changes, so the server re-sends the job
  public onDifficultyChanged: (() => void) | null = null;

  // Bootstrap: quick vardiff estimation for new workers
  private authorizedAt: number = 0;
  private hasBootstrapped: boolean = false;

  private shareTimestamps: number[] = [];
  private vardiffTimer: NodeJS.Timeout | null = null;
  private msgBuffer: string = "";

  // OOM protection: 10 KB limit on TCP buffer
  private static readonly MAX_BUFFER_SIZE = 10 * 1024;

  public onMessage: ((method: string, params: any[], id: number | null) => void) | null = null;
  public onDisconnect: (() => void) | null = null;

  constructor(socket: net.Socket, extraNonce: string, startDifficulty?: number) {
    this.socket = socket;
    this.subscriptionId = crypto.randomBytes(16).toString("hex");
    this.extraNonce = extraNonce;

    // If a starting diff is provided (worker reconnection), use it
    if (startDifficulty && startDifficulty >= VARDIFF_CONFIG.minDiff) {
      this.difficulty = Math.min(startDifficulty, VARDIFF_CONFIG.maxDiff);
    }

    // TCP keepalive: detects dead connections (miner crash without FIN)
    socket.setKeepAlive(true, 30000);

    socket.setEncoding("utf8");
    socket.on("data", (data: string) => this.handleData(data));
    socket.on("error", (err) => {
      console.log("[Session] Socket error " + (this.address ? this.address.substring(0, 12) + "..." + this.worker : socket.remoteAddress) + ": " + (err?.message || err));
      this.disconnect();
    });
    socket.on("close", (hadError) => {
      console.log("[Session] Socket close " + (this.address ? this.address.substring(0, 12) + "..." + this.worker : "unknown") + (hadError ? " (avec erreur)" : ""));
      if (this.onDisconnect) this.onDisconnect();
    });

    // Auth timeout: 30s
    setTimeout(() => {
      if (!this.authorized) this.disconnect();
    }, 30000);

    // Periodic vardiff retarget
    this.vardiffTimer = setInterval(() => this.retargetDifficulty(), VARDIFF_CONFIG.retargetTime * 1000);
  }

  private handleData(data: string) {
    this.msgBuffer += data;

    // OOM protection: disconnect if buffer too large (client without newline)
    if (this.msgBuffer.length > MinerSession.MAX_BUFFER_SIZE) {
      console.warn("[Session] Buffer overflow (" + this.msgBuffer.length + " bytes), deconnexion " + (this.socket.remoteAddress || "unknown"));
      this.disconnect();
      return;
    }

    const lines = this.msgBuffer.split("\n");
    this.msgBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (this.onMessage) {
          this.onMessage(msg.method, msg.params || [], msg.id ?? null);
        }
      } catch {
        // Invalid JSON, ignore
      }
    }
  }

  send(data: any) {
    try {
      if (this.socket.destroyed) return;
      const json = JSON.stringify(data);
      this.socket.write(json + "\n");
    } catch (err: any) {
      console.log("[Session] Write error " + (this.address || "unknown") + ": " + (err?.message || err));
      this.disconnect();
    }
  }

  sendResult(id: number | null, result: any, error: any = null) {
    this.send({ id, result, error });
  }

  sendNotify(method: string, params: any[]) {
    this.send({ id: null, method, params });
  }

  setDifficulty(diff: number) {
    this.difficulty = Math.max(VARDIFF_CONFIG.minDiff, Math.min(VARDIFF_CONFIG.maxDiff, Math.round(diff)));
    // The new bShare will be applied on the next natural job (new block or poll)
    // DO NOT re-send the job here — re-sending a mining.notify with the same jobId
    // but a different bShare confuses lolMiner and causes silent disconnections
  }

  recordShare() {
    const now = Date.now();
    this.shareTimestamps.push(now);
    if (this.shareTimestamps.length > 20) {
      this.shareTimestamps = this.shareTimestamps.slice(-20);
    }

    // Bootstrap disabled — the standard vardiff (retarget every 90s) is sufficient.
    // Bootstrap caused aberrant vardiffs (e.g., 272507) when the time between
    // authorization and 1st share was long (phantom sessions, reconnections), which
    // made the next job impossible to solve for the miner.
  }

  private retargetDifficulty() {
    // Need at least 8 shares for a reliable calculation (more stable average)
    if (this.shareTimestamps.length < 8) return;

    const times: number[] = [];
    for (let i = 1; i < this.shareTimestamps.length; i++) {
      times.push((this.shareTimestamps[i] - this.shareTimestamps[i - 1]) / 1000);
    }
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const target = VARDIFF_CONFIG.targetShareTime;
    const variance = target * (VARDIFF_CONFIG.variancePercent / 100);

    if (avgTime < target - variance || avgTime > target + variance) {
      // Calculate change ratio
      let ratio = avgTime / target;

      // IMPORTANT: Limit change to x1.25 or /1.25 max per cycle
      // This prevents violent oscillations that caused disconnections
      if (ratio > MAX_DIFF_CHANGE_RATIO) ratio = MAX_DIFF_CHANGE_RATIO;
      if (ratio < 1 / MAX_DIFF_CHANGE_RATIO) ratio = 1 / MAX_DIFF_CHANGE_RATIO;

      const newDiff = this.difficulty * ratio;
      const clampedDiff = Math.max(VARDIFF_CONFIG.minDiff, Math.min(VARDIFF_CONFIG.maxDiff, Math.round(newDiff)));

      if (clampedDiff !== this.difficulty) {
        this.setDifficulty(clampedDiff);
        // Reset buffer after retarget
        this.shareTimestamps = [Date.now()];
      }
    }
  }

  // --- Getters for idle sweep (server.ts) ---

  /** Timestamp of the last share, or 0 if none */
  getLastShareTimestamp(): number {
    return this.shareTimestamps.length > 0 ? this.shareTimestamps[this.shareTimestamps.length - 1] : 0;
  }

  /** Reset the share buffer (used by idle sweep after bump) */
  resetShareTimestamps() {
    this.shareTimestamps = [];
  }

  // --- Bootstrap (quick initial estimation) ---

  /** Records the authorization moment (to calculate time until the 1st share) */
  markAuthorized() {
    this.authorizedAt = Date.now();
  }

  /** Disables bootstrap (for workers restored from cache that already have a good vardiff) */
  markBootstrapped() {
    this.hasBootstrapped = true;
  }

  disconnect() {
    if (this.vardiffTimer) clearInterval(this.vardiffTimer);
    try { this.socket.destroy(); } catch {}
  }
}
