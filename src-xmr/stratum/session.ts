import net from "net";
import crypto from "crypto";

interface VardiffConfig {
  targetShareTime: number;
  minDiff: number;
  maxDiff: number;
  retargetTime: number;
  variancePercent: number;
}

// Vardiff pour Monero CPU mining
// Les CPUs sont plus stables que les GPUs, donc on peut etre plus agressif
const VARDIFF_CONFIG: VardiffConfig = {
  targetShareTime: 15,       // 15 secondes entre chaque share
  minDiff: 1000,             // Plancher : adapte aux CPUs faibles
  maxDiff: 2000000,          // Plafond : adapte aux gros CPUs (Ryzen 9950X ~35 KH/s)
  retargetTime: 30,          // 30s entre chaque ajustement (converge vite)
  variancePercent: 30,       // Zone morte 30%
};

const DEFAULT_INITIAL_DIFF = 10000; // Diff initiale pour CPU
const MAX_DIFF_CHANGE_RATIO = 2;

export class XmrMinerSession {
  public socket: net.Socket;
  public address: string = "";
  public worker: string = "default";
  public authorized: boolean = false;
  public difficulty: number = DEFAULT_INITIAL_DIFF;
  public sessionId: string; // ID de session envoye au mineur
  public lastJobId: string = ""; // Dernier job envoye
  public agent: string = ""; // User-agent du mineur (ex: XMRig/6.21.0)

  // Vardiff envoye au mineur avec le dernier job
  public lastSentDifficulty: number = DEFAULT_INITIAL_DIFF;

  public onDifficultyChanged: (() => void) | null = null;

  private shareTimestamps: number[] = [];
  private vardiffTimer: NodeJS.Timeout | null = null;
  private msgBuffer: string = "";

  private static readonly MAX_BUFFER_SIZE = 10 * 1024;

  public onMessage: ((data: any) => void) | null = null;
  public onDisconnect: (() => void) | null = null;

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.sessionId = crypto.randomBytes(8).toString("hex");

    socket.setKeepAlive(true, 30000);
    socket.setEncoding("utf8");
    socket.on("data", (data: string) => this.handleData(data));
    socket.on("error", (err) => {
      console.log("[XMR Session] Socket error " + (this.address ? this.address.substring(0, 12) + "..." + this.worker : socket.remoteAddress) + ": " + (err?.message || err));
      this.disconnect();
    });
    socket.on("close", () => {
      if (this.onDisconnect) this.onDisconnect();
    });

    // Timeout auth : 30s
    setTimeout(() => {
      if (!this.authorized) this.disconnect();
    }, 30000);

    // Vardiff retarget periodique
    this.vardiffTimer = setInterval(() => this.retargetDifficulty(), VARDIFF_CONFIG.retargetTime * 1000);
  }

  private handleData(data: string) {
    this.msgBuffer += data;

    if (this.msgBuffer.length > XmrMinerSession.MAX_BUFFER_SIZE) {
      console.warn("[XMR Session] Buffer overflow, deconnexion " + (this.socket.remoteAddress || "unknown"));
      this.disconnect();
      return;
    }

    const lines = this.msgBuffer.split("\n");
    this.msgBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (this.onMessage) this.onMessage(msg);
      } catch {
        // JSON invalide, ignorer
      }
    }
  }

  send(data: any) {
    try {
      if (this.socket.destroyed) return;
      this.socket.write(JSON.stringify(data) + "\n");
    } catch (err: any) {
      console.log("[XMR Session] Write error: " + (err?.message || err));
      this.disconnect();
    }
  }

  // Repondre a une requete JSON-RPC (id + result/error)
  sendResult(id: number | string | null, result: any, error: any = null) {
    if (error) {
      this.send({ id, jsonrpc: "2.0", error: { code: -1, message: error } });
    } else {
      this.send({ id, jsonrpc: "2.0", result });
    }
  }

  // Envoyer un job au mineur (notification, pas de id dans la reponse)
  sendJob(job: {
    blob: string;
    job_id: string;
    target: string;
    height: number;
    seed_hash: string;
  }) {
    this.lastJobId = job.job_id;
    this.lastSentDifficulty = this.difficulty;
    this.send({
      jsonrpc: "2.0",
      method: "job",
      params: job,
    });
  }

  setDifficulty(diff: number) {
    this.difficulty = Math.max(VARDIFF_CONFIG.minDiff, Math.min(VARDIFF_CONFIG.maxDiff, Math.round(diff)));
  }

  recordShare() {
    const now = Date.now();
    this.shareTimestamps.push(now);
    if (this.shareTimestamps.length > 20) {
      this.shareTimestamps = this.shareTimestamps.slice(-20);
    }
  }

  private retargetDifficulty() {
    if (this.shareTimestamps.length < 4) return;

    const times: number[] = [];
    for (let i = 1; i < this.shareTimestamps.length; i++) {
      times.push((this.shareTimestamps[i] - this.shareTimestamps[i - 1]) / 1000);
    }
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const target = VARDIFF_CONFIG.targetShareTime;
    const variance = target * (VARDIFF_CONFIG.variancePercent / 100);

    if (avgTime < target - variance || avgTime > target + variance) {
      // ratio > 1 quand shares trop rapides (augmenter diff)
      // ratio < 1 quand shares trop lentes (diminuer diff)
      let ratio = target / avgTime;
      if (ratio > MAX_DIFF_CHANGE_RATIO) ratio = MAX_DIFF_CHANGE_RATIO;
      if (ratio < 1 / MAX_DIFF_CHANGE_RATIO) ratio = 1 / MAX_DIFF_CHANGE_RATIO;

      const newDiff = this.difficulty * ratio;
      const clampedDiff = Math.max(VARDIFF_CONFIG.minDiff, Math.min(VARDIFF_CONFIG.maxDiff, Math.round(newDiff)));

      if (clampedDiff !== this.difficulty) {
        this.setDifficulty(clampedDiff);
        this.shareTimestamps = [Date.now()];
        // Notifier le serveur pour renvoyer un job avec la nouvelle diff
        if (this.onDifficultyChanged) this.onDifficultyChanged();
      }
    }
  }

  getLastShareTimestamp(): number {
    return this.shareTimestamps.length > 0 ? this.shareTimestamps[this.shareTimestamps.length - 1] : 0;
  }

  disconnect() {
    if (this.vardiffTimer) clearInterval(this.vardiffTimer);
    try { this.socket.destroy(); } catch {}
  }
}
