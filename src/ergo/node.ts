import { config } from "../config";

interface NodeInfo {
  fullHeight: number;
  headersHeight: number;
  difficulty: number;
  peersCount: number;
  appVersion: string;
  unconfirmedCount: number;
  name: string;
  network: string;
}

interface BlockHeader {
  id: string;
  height: number;
  difficulty: number;
  timestamp: number;
}

export interface MiningCandidate {
  msg: string;
  b: string;
  h: number;
  pk: string;
}

class ErgoNode {
  private baseUrl: string;
  private apiKey: string;
  private defaultTimeout: number = 10000; // 10 seconds

  constructor() {
    this.baseUrl = config.ergoNode.url;
    this.apiKey = config.ergoNode.apiKey;
  }

  private headers(json: boolean = false): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.apiKey) h["api_key"] = this.apiKey;
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  async getInfo(): Promise<NodeInfo> {
    const res = await fetch(this.baseUrl + "/info", {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.defaultTimeout),
    });
    if (!res.ok) throw new Error("Node API error: " + res.status);
    return (await res.json()) as NodeInfo;
  }

  async isSynced(): Promise<boolean> {
    try {
      const info = await this.getInfo();
      if (!info.headersHeight || !info.fullHeight) return false;
      return (info.headersHeight - info.fullHeight) < 5;
    } catch {
      return false;
    }
  }

  async getNetworkDifficulty(): Promise<number> {
    try {
      const info = await this.getInfo();
      return info.difficulty || 0;
    } catch {
      return 0;
    }
  }

  async getMiningCandidate(): Promise<MiningCandidate | null> {
    const res = await fetch(this.baseUrl + "/mining/candidate", {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.defaultTimeout),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const bMatch = text.match(/"b"\s*:\s*(\d+)/);
    const bStr = bMatch ? bMatch[1] : "0";
    const data = JSON.parse(text);
    return {
      msg: data.msg || "",
      b: bStr,
      h: data.h || 0,
      pk: data.pk || "",
    };
  }

  async submitSolution(solution: any): Promise<boolean> {
    try {
      const body = JSON.stringify(solution);
      console.log("[Node] submitSolution POST /mining/solution body=" + body);
      const res = await fetch(this.baseUrl + "/mining/solution", {
        method: "POST",
        headers: this.headers(true),
        body,
        signal: AbortSignal.timeout(this.defaultTimeout),
      });
      const text = await res.text();
      console.log("[Node] submitSolution response: HTTP " + res.status + " body=" + text);
      return res.ok;
    } catch (err: any) {
      console.error("[Node] submitSolution ERREUR:", err?.message || err);
      return false;
    }
  }

  async getBlockHeaderById(id: string): Promise<BlockHeader> {
    const res = await fetch(this.baseUrl + "/blocks/" + id + "/header", {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.defaultTimeout),
    });
    if (!res.ok) throw new Error("Block header error: " + res.status);
    return (await res.json()) as BlockHeader;
  }

  async getEmissionReward(height: number): Promise<bigint> {
    try {
      const res = await fetch(this.baseUrl + "/emission/at/" + height, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.defaultTimeout),
      });
      if (!res.ok) throw new Error("Emission API error: " + res.status);
      const data = await res.json() as { minerReward: number };
      return BigInt(data.minerReward);
    } catch (err) {
      console.error("[Node] Erreur getEmissionReward pour hauteur " + height + ":", err);
      return BigInt(3_000_000_000);
    }
  }

  async getBlockIdsAtHeight(height: number): Promise<string[]> {
    try {
      const res = await fetch(this.baseUrl + "/blocks/at/" + height, {
        headers: this.headers(),
        signal: AbortSignal.timeout(this.defaultTimeout),
      });
      if (!res.ok) return [];
      const blockIds = await res.json();
      if (Array.isArray(blockIds)) return blockIds;
      return [];
    } catch {
      return [];
    }
  }

  async isBlockOnChain(height: number, blockId: string): Promise<boolean> {
    try {
      const blockIds = await this.getBlockIdsAtHeight(height);
      if (blockIds.length === 0) return false;
      return blockIds.includes(blockId);
    } catch (err) {
      // On network error, return true (= don't mark as orphan)
      // It's safer than marking a valid block as orphan by mistake
      // The confirmer will retry in the next cycle
      console.warn("[Node] isBlockOnChain erreur pour hauteur " + height + ", presume valide:", err);
      return true;
    }
  }

  // Get the last network block timestamp (for the progress bar)
  async getLastBlockTimestamp(): Promise<number | null> {
    try {
      const info = await this.getInfo();
      const height = info.fullHeight;
      const blockIds = await this.getBlockIdsAtHeight(height);
      if (blockIds.length === 0) return null;
      const header = await this.getBlockHeaderById(blockIds[0]);
      return header.timestamp;
    } catch {
      return null;
    }
  }
}

export const ergoNode = new ErgoNode();
