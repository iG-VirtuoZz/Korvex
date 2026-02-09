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
  minDiff: 100,        // Plancher: supporte jusqu'a ~200 GH/s
  maxDiff: 500000,     // Plafond: supporte jusqu'a ~40 MH/s
  retargetTime: 90,    // 90s entre chaque ajustement (plus stable)
  variancePercent: 30, // Tolerance 30% avant ajustement (zone morte elargie)
};

const DEFAULT_INITIAL_DIFF = 20000; // Diff initiale moyenne

// Limite de changement par retarget: max x1.25 ou /1.25 (anti-oscillation)
const MAX_DIFF_CHANGE_RATIO = 1.25;

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
  public miningMode: 'pplns' | 'solo' = 'pplns';
  public minerType: MinerType = "unknown";
  public userAgent: string = "";

  // Vardiff envoye au mineur avec le dernier mining.notify
  // Utilise pour la validation des shares (le mineur mine avec CE bShare)
  public lastSentDifficulty: number = DEFAULT_INITIAL_DIFF;

  // Callback appele quand le vardiff change, pour que le serveur re-envoie le job
  public onDifficultyChanged: (() => void) | null = null;

  // Bootstrap : estimation rapide du vardiff pour les nouveaux workers
  private authorizedAt: number = 0;
  private hasBootstrapped: boolean = false;

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

    // TCP keepalive : detecte les connexions mortes (mineur crash sans FIN)
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
    // Le nouveau bShare sera applique au prochain job naturel (nouveau bloc ou poll)
    // NE PAS renvoyer le job ici — renvoyer un mining.notify avec le meme jobId
    // mais un bShare different confond lolMiner et cause des deconnexions silencieuses
  }

  recordShare() {
    const now = Date.now();
    this.shareTimestamps.push(now);
    if (this.shareTimestamps.length > 20) {
      this.shareTimestamps = this.shareTimestamps.slice(-20);
    }

    // Bootstrap desactive — le vardiff standard (retarget toutes les 90s) suffit.
    // Le bootstrap causait des vardiff aberrants (ex: 272507) quand le temps entre
    // autorisation et 1ere share etait long (sessions fantomes, reconnexions), ce qui
    // rendait le prochain job impossible a resoudre pour le mineur.
  }

  private retargetDifficulty() {
    // Besoin d'au moins 8 shares pour un calcul fiable (moyenne plus stable)
    if (this.shareTimestamps.length < 8) return;

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

      // IMPORTANT: Limiter le changement a x1.25 ou /1.25 max par cycle
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

  // --- Getters pour l'idle sweep (server.ts) ---

  /** Timestamp de la derniere share, ou 0 si aucune */
  getLastShareTimestamp(): number {
    return this.shareTimestamps.length > 0 ? this.shareTimestamps[this.shareTimestamps.length - 1] : 0;
  }

  /** Reset le buffer de shares (utilise par l'idle sweep apres bump) */
  resetShareTimestamps() {
    this.shareTimestamps = [];
  }

  // --- Bootstrap (estimation initiale rapide) ---

  /** Enregistre le moment d'autorisation (pour calculer le temps jusqu'a la 1ere share) */
  markAuthorized() {
    this.authorizedAt = Date.now();
  }

  /** Desactive le bootstrap (pour les workers restaures du cache qui ont deja un bon vardiff) */
  markBootstrapped() {
    this.hasBootstrapped = true;
  }

  disconnect() {
    if (this.vardiffTimer) clearInterval(this.vardiffTimer);
    try { this.socket.destroy(); } catch {}
  }
}
