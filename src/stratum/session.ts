import net from "net";
import crypto from "crypto";

interface VardiffConfig {
  targetShareTime: number; // secondes entre chaque share
  minDiff: number;
  maxDiff: number;
  retargetTime: number; // secondes avant recalcul
  variancePercent: number;
}

// Modele multiplyDifficulty : le vardiff controle directement le b envoye au mineur
// bShare = bNetwork * vardiff (envoye dans mining.notify params[6])
// mining.set_difficulty envoie toujours 1 (neutre, les mineurs Ergo l'ignorent)
const VARDIFF_CONFIG: VardiffConfig = {
  targetShareTime: 15,
  minDiff: 5000,       // Plancher: evite shares trop frequentes
  maxDiff: 100000,     // Plafond: evite oscillations (vardiff 241781 causait des bugs)
  retargetTime: 90,    // 90s entre chaque ajustement (plus stable)
  variancePercent: 25, // Tolerance 25% avant ajustement
};

const DEFAULT_INITIAL_DIFF = 20000; // Diff initiale moyenne

// Limite de changement par retarget: max x1.5 ou /1.5 (evite sauts brutaux)
const MAX_DIFF_CHANGE_RATIO = 1.5;

// Type de mineur detecte via user-agent dans mining.subscribe
// Certains mineurs (SRBMiner) interpretent set_difficulty differemment
export type MinerType = "lolminer" | "teamredminer" | "srbminer" | "unknown";

export class MinerSession {
  public socket: net.Socket;
  public address: string = "";
  public worker: string = "default";
  public authorized: boolean = false;
  public difficulty: number = DEFAULT_INITIAL_DIFF;
  public subscriptionId: string;
  public extraNonce: string;
  public minerType: MinerType = "unknown";
  public userAgent: string = "";

  // Callback appele quand le vardiff change, pour que le serveur re-envoie le job
  public onDifficultyChanged: (() => void) | null = null;

  private shareTimestamps: number[] = [];
  private vardiffTimer: NodeJS.Timeout | null = null;
  private msgBuffer: string = "";

  // Protection OOM : limite 10 KB sur le buffer TCP
  private static readonly MAX_BUFFER_SIZE = 10 * 1024;

  public onMessage: ((method: string, params: any[], id: number | null) => void) | null = null;
  public onDisconnect: (() => void) | null = null;

  constructor(socket: net.Socket, extraNonce: string, startDifficulty?: number) {
    this.socket = socket;
    this.subscriptionId = crypto.randomBytes(16).toString("hex");
    this.extraNonce = extraNonce;

    // Si une diff de depart est fournie (reconnexion worker), l'utiliser
    if (startDifficulty && startDifficulty >= VARDIFF_CONFIG.minDiff) {
      this.difficulty = Math.min(startDifficulty, VARDIFF_CONFIG.maxDiff);
    }

    socket.setEncoding("utf8");
    socket.on("data", (data: string) => this.handleData(data));
    socket.on("error", () => this.disconnect());
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

    // Protection OOM : deconnecter si buffer trop grand (client sans newline)
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
        // JSON invalide, ignorer
      }
    }
  }

  send(data: any) {
    try {
      this.socket.write(JSON.stringify(data) + "\n");
    } catch {
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
    // Toujours envoyer 1: tous les mineurs utilisent le b pre-multiplie de mining.notify
    this.sendNotify("mining.set_difficulty", [1]);
    // Informer le serveur pour qu'il re-envoie le job avec le nouveau b
    if (this.onDifficultyChanged) this.onDifficultyChanged();
  }

  recordShare() {
    const now = Date.now();
    this.shareTimestamps.push(now);
    if (this.shareTimestamps.length > 20) {
      this.shareTimestamps = this.shareTimestamps.slice(-20);
    }
    // Pas de fast retarget : le retarget periodique (60s) suffit.
    // Le fast retarget causait des oscillations violentes avec multiplyDifficulty
    // car diviser le vardiff par 2 rendait la target 2x plus dure, puis le
    // retarget normal remontait car les shares etaient trop lentes, etc.
  }

  private retargetDifficulty() {
    // Besoin d'au moins 6 shares pour un calcul fiable
    if (this.shareTimestamps.length < 6) return;

    const times: number[] = [];
    for (let i = 1; i < this.shareTimestamps.length; i++) {
      times.push((this.shareTimestamps[i] - this.shareTimestamps[i - 1]) / 1000);
    }
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const target = VARDIFF_CONFIG.targetShareTime;
    const variance = target * (VARDIFF_CONFIG.variancePercent / 100);

    if (avgTime < target - variance || avgTime > target + variance) {
      // Calcul du ratio de changement
      let ratio = avgTime / target;

      // IMPORTANT: Limiter le changement a x1.5 ou /1.5 max par cycle
      // Cela evite les oscillations violentes qui causaient les deconnexions
      if (ratio > MAX_DIFF_CHANGE_RATIO) ratio = MAX_DIFF_CHANGE_RATIO;
      if (ratio < 1 / MAX_DIFF_CHANGE_RATIO) ratio = 1 / MAX_DIFF_CHANGE_RATIO;

      const newDiff = this.difficulty * ratio;
      const clampedDiff = Math.max(VARDIFF_CONFIG.minDiff, Math.min(VARDIFF_CONFIG.maxDiff, Math.round(newDiff)));

      if (clampedDiff !== this.difficulty) {
        this.setDifficulty(clampedDiff);
        // Reset buffer apres retarget
        this.shareTimestamps = [Date.now()];
      }
    }
  }

  disconnect() {
    if (this.vardiffTimer) clearInterval(this.vardiffTimer);
    try { this.socket.destroy(); } catch {}
  }
}
