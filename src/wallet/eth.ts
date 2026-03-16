import { ethers } from "ethers";
import axios from "axios";
import { logger } from "../utils/logger";

export interface WalletStatus {
  address: string;
  balanceEth: string;
  balanceUsd: number;
  lastChecked: string;
  recentTxCount: number;
  isLowBalance: boolean;
}

const LOW_BALANCE_THRESHOLD_ETH = 0.005;

export class EthWallet {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  private cachedStatus?: WalletStatus;
  private lastFetch = 0;
  private cacheTtlMs = 60000;

  constructor() {
    const privateKey = process.env.ETH_PRIVATE_KEY;
    const rpcUrl =
      process.env.ETH_RPC_URL || "https://mainnet.infura.io/v3/public";

    if (!privateKey) {
      logger.warn("[Wallet] ETH_PRIVATE_KEY not set — wallet features disabled");
      this.wallet = ethers.Wallet.createRandom();
    } else {
      this.wallet = new ethers.Wallet(privateKey);
    }

    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = this.wallet.connect(this.provider);
  }

  get address(): string {
    return this.wallet.address;
  }

  async getStatus(): Promise<WalletStatus> {
    if (this.cachedStatus && Date.now() - this.lastFetch < this.cacheTtlMs) {
      return this.cachedStatus;
    }

    try {
      const balanceWei = await this.provider.getBalance(this.wallet.address);
      const balanceEth = ethers.formatEther(balanceWei);
      const ethPriceUsd = await this.fetchEthPrice();
      const balanceUsd = parseFloat(balanceEth) * ethPriceUsd;
      const isLowBalance =
        parseFloat(balanceEth) < LOW_BALANCE_THRESHOLD_ETH;

      if (isLowBalance) {
        logger.warn(
          `[Wallet] Low balance: ${parseFloat(balanceEth).toFixed(4)} ETH — consider topping up`
        );
      }

      const status: WalletStatus = {
        address: this.wallet.address,
        balanceEth: parseFloat(balanceEth).toFixed(6),
        balanceUsd: Math.round(balanceUsd * 100) / 100,
        lastChecked: new Date().toISOString(),
        recentTxCount: 0,
        isLowBalance,
      };

      this.cachedStatus = status;
      this.lastFetch = Date.now();
      return status;
    } catch (error) {
      logger.error("[Wallet] Failed to fetch balance", { error });
      return {
        address: this.wallet.address,
        balanceEth: "0",
        balanceUsd: 0,
        lastChecked: new Date().toISOString(),
        recentTxCount: 0,
        isLowBalance: true,
      };
    }
  }

  /** Sign a message to prove agent identity on-chain */
  async signMessage(message: string): Promise<string> {
    return this.wallet.signMessage(message);
  }

  /** Verify a signed message came from this wallet */
  verifyMessage(message: string, signature: string): boolean {
    try {
      const signer = ethers.verifyMessage(message, signature);
      return signer.toLowerCase() === this.wallet.address.toLowerCase();
    } catch {
      return false;
    }
  }

  /** Generate a time-bound signed token for Moltlaunch auth */
  async generateAuthToken(): Promise<{ token: string; expires: number }> {
    const expires = Math.floor(Date.now() / 1000) + 300; // 5 min
    const message = `ASAM-CashClaw:${this.wallet.address}:${expires}`;
    const signature = await this.signMessage(message);
    return { token: `${message}:${signature}`, expires };
  }

  private async fetchEthPrice(): Promise<number> {
    try {
      const response = await axios.get(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
        { timeout: 5000 }
      );
      return response.data?.ethereum?.usd ?? 2000;
    } catch {
      return 2000; // fallback price
    }
  }
}
