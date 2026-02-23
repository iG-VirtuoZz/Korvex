import { xmrConfig } from "../config";

// Client JSON-RPC pour monero-wallet-rpc
// Doc : https://www.getmonero.org/resources/developer-guides/wallet-rpc.html

interface TransferDestination {
  amount: number; // en piconero (entier)
  address: string;
}

interface TransferResult {
  tx_hash: string;
  tx_key: string;
  amount: number;
  fee: number;
  tx_hash_list?: string[];
  fee_list?: number[];
  amount_list?: number[];
}

interface WalletBalance {
  balance: number; // total en piconero
  unlocked_balance: number; // disponible en piconero
}

class MoneroWallet {
  private baseUrl: string;
  private defaultTimeout: number = 30000; // 30s pour les transfers

  constructor() {
    this.baseUrl = xmrConfig.walletRpc.url;
  }

  private async jsonRpc(method: string, params: any = {}): Promise<any> {
    const res = await fetch(this.baseUrl + "/json_rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "0", method, params }),
      signal: AbortSignal.timeout(this.defaultTimeout),
    });
    if (!res.ok) throw new Error("Wallet RPC error: HTTP " + res.status);
    const json = await res.json() as any;
    if (json.error) throw new Error("Wallet RPC error: " + json.error.message);
    return json.result;
  }

  async getBalance(): Promise<WalletBalance> {
    const result = await this.jsonRpc("get_balance", { account_index: 0 });
    return {
      balance: result.balance || 0,
      unlocked_balance: result.unlocked_balance || 0,
    };
  }

  async getAddress(): Promise<string> {
    const result = await this.jsonRpc("get_address", { account_index: 0 });
    return result.address || "";
  }

  // Envoyer un paiement a un ou plusieurs destinataires
  // Monero supporte max 16 outputs par transaction
  // transfer_split gere automatiquement le decoupage si necessaire
  async transferSplit(destinations: TransferDestination[]): Promise<TransferResult> {
    if (destinations.length === 0) {
      throw new Error("Aucune destination pour le transfert");
    }
    if (destinations.length > 16) {
      throw new Error("Max 16 destinations par transaction Monero");
    }

    const result = await this.jsonRpc("transfer_split", {
      destinations,
      account_index: 0,
      priority: 0, // default = auto
      // Ne pas specifier ring_size : wallet-rpc utilise la valeur du consensus actuel
      // (actuellement 16, mais laissons le daemon gerer en cas de hardfork)
      get_tx_keys: true,
    });

    return {
      tx_hash: result.tx_hash_list?.[0] || "",
      tx_key: result.tx_key_list?.[0] || "",
      amount: result.amount_list?.reduce((a: number, b: number) => a + b, 0) || 0,
      fee: result.fee_list?.reduce((a: number, b: number) => a + b, 0) || 0,
      tx_hash_list: result.tx_hash_list || [],
      fee_list: result.fee_list || [],
      amount_list: result.amount_list || [],
    };
  }

  // Verifier la hauteur du wallet (doit etre synchro avec le daemon)
  async getHeight(): Promise<number> {
    const result = await this.jsonRpc("get_height");
    return result.height || 0;
  }

  // Rafraichir le wallet (forcer la rescan)
  async refresh(): Promise<void> {
    await this.jsonRpc("refresh");
  }
}

export const wallet = new MoneroWallet();
