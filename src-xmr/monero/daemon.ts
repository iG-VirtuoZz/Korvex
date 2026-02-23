import { xmrConfig } from "../config";

// Client JSON-RPC pour monerod
// Doc : https://www.getmonero.org/resources/developer-guides/daemon-rpc.html

interface BlockTemplate {
  blocktemplate_blob: string;
  blockhashing_blob: string;
  difficulty: number;
  difficulty_top64: number;
  expected_reward: number;
  height: number;
  prev_hash: string;
  seed_hash: string;
  seed_height: number;
  next_seed_hash: string;
}

interface BlockHeader {
  block_size: number;
  depth: number;
  difficulty: number;
  hash: string;
  height: number;
  major_version: number;
  minor_version: number;
  nonce: number;
  num_txes: number;
  orphan_status: boolean;
  prev_hash: string;
  reward: number;
  timestamp: number;
}

interface DaemonInfo {
  height: number;
  difficulty: number;
  target: number; // temps de bloc cible en secondes (120)
  tx_pool_size: number;
  incoming_connections_count: number;
  outgoing_connections_count: number;
  synchronized: boolean;
  status: string;
  top_block_hash: string;
}

class MoneroDaemon {
  private baseUrl: string;
  private defaultTimeout: number = 15000;

  constructor() {
    this.baseUrl = xmrConfig.daemon.url;
  }

  // Appel JSON-RPC generique
  private async jsonRpc(method: string, params: any = {}): Promise<any> {
    const res = await fetch(this.baseUrl + "/json_rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "0", method, params }),
      signal: AbortSignal.timeout(this.defaultTimeout),
    });
    if (!res.ok) throw new Error("Daemon RPC error: HTTP " + res.status);
    const json = await res.json() as any;
    if (json.error) throw new Error("Daemon RPC error: " + json.error.message);
    return json.result;
  }

  // Appel endpoint non-JSON-RPC (ex: /submit_block)
  private async otherRpc(path: string, body?: any): Promise<any> {
    const res = await fetch(this.baseUrl + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.defaultTimeout),
    });
    if (!res.ok) throw new Error("Daemon RPC error: HTTP " + res.status + " on " + path);
    return res.json();
  }

  async getInfo(): Promise<DaemonInfo> {
    const result = await this.jsonRpc("get_info");
    return {
      height: result.height || 0,
      difficulty: result.difficulty || 0,
      target: result.target || 120,
      tx_pool_size: result.tx_pool_size || 0,
      incoming_connections_count: result.incoming_connections_count || 0,
      outgoing_connections_count: result.outgoing_connections_count || 0,
      synchronized: result.synchronized || false,
      status: result.status || "UNKNOWN",
      top_block_hash: result.top_block_hash || "",
    };
  }

  async isSynced(): Promise<boolean> {
    try {
      const info = await this.getInfo();
      return info.synchronized && info.height > 0;
    } catch {
      return false;
    }
  }

  async getBlockTemplate(walletAddress: string, reserveSize: number = 8): Promise<BlockTemplate> {
    const result = await this.jsonRpc("get_block_template", {
      wallet_address: walletAddress,
      reserve_size: reserveSize,
    });
    return {
      blocktemplate_blob: result.blocktemplate_blob || "",
      blockhashing_blob: result.blockhashing_blob || "",
      difficulty: result.difficulty || 0,
      difficulty_top64: result.difficulty_top64 || 0,
      expected_reward: result.expected_reward || 0,
      height: result.height || 0,
      prev_hash: result.prev_hash || "",
      seed_hash: result.seed_hash || "",
      seed_height: result.seed_height || 0,
      next_seed_hash: result.next_seed_hash || "",
    };
  }

  async submitBlock(blobHex: string): Promise<boolean> {
    try {
      // submit_block prend un array de blobs hex
      const result = await this.jsonRpc("submit_block", [blobHex]);
      return result?.status === "OK";
    } catch (err: any) {
      console.error("[Daemon] submitBlock erreur:", err?.message || err);
      return false;
    }
  }

  async getBlockHeaderByHeight(height: number): Promise<BlockHeader> {
    const result = await this.jsonRpc("get_block_header_by_height", { height });
    return result.block_header;
  }

  async getBlockHeaderByHash(hash: string): Promise<BlockHeader> {
    const result = await this.jsonRpc("get_block_header_by_hash", { hash });
    return result.block_header;
  }

  async getLastBlockHeader(): Promise<BlockHeader> {
    const result = await this.jsonRpc("get_last_block_header");
    return result.block_header;
  }

  // Calculer le seed hash pour une hauteur donnee
  // Le seed hash change tous les 2048 blocs
  getSeedHeight(height: number): number {
    return Math.max(0, (height - 1) - ((height - 1) % 2048));
  }
}

export const daemon = new MoneroDaemon();
