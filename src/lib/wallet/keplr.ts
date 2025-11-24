import { Window as KeplrWindow } from "@keplr-wallet/types";
import { OfflineSigner } from "@cosmjs/proto-signing";

declare global {
  interface Window extends KeplrWindow {}
}

// Celestia Mocha Testnet configuration
export const CELESTIA_TESTNET_CONFIG = {
  chainId: "mocha-4",
  chainName: "Celestia Mocha Testnet",
  rpc: "https://rpc-mocha.pops.one",
  rest: "https://api-mocha.pops.one",
  bip44: {
    coinType: 118,
  },
  bech32Config: {
    bech32PrefixAccAddr: "celestia",
    bech32PrefixAccPub: "celestiapub",
    bech32PrefixValAddr: "celestiavaloper",
    bech32PrefixValPub: "celestiavaloperpub",
    bech32PrefixConsAddr: "celestiavalcons",
    bech32PrefixConsPub: "celestiavalconspub",
  },
  currencies: [
    {
      coinDenom: "TIA",
      coinMinimalDenom: "utia",
      coinDecimals: 6,
    },
  ],
  feeCurrencies: [
    {
      coinDenom: "TIA",
      coinMinimalDenom: "utia",
      coinDecimals: 6,
      gasPriceStep: {
        low: 0.01,
        average: 0.02,
        high: 0.1,
      },
    },
  ],
  stakeCurrency: {
    coinDenom: "TIA",
    coinMinimalDenom: "utia",
    coinDecimals: 6,
  },
};

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  balance?: {
    utia: number;
    tia: number;
  };
}

export interface PaymentTransaction {
  txHash: string;
  success: boolean;
  error?: string;
  gasUsed?: number;
  fee?: string;
}

export class KeplrWallet {
  private static instance: KeplrWallet;
  private state: WalletState = {
    isConnected: false,
    address: null,
    isConnecting: false,
    error: null,
  };

  private listeners: ((state: WalletState) => void)[] = [];

  private constructor() {
    // Initialize wallet connection if available
    this.initializeConnection();
  }

  static getInstance(): KeplrWallet {
    if (!KeplrWallet.instance) {
      KeplrWallet.instance = new KeplrWallet();
    }
    return KeplrWallet.instance;
  }

  subscribe(listener: (state: WalletState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.state));
  }

  private updateState(updates: Partial<WalletState>) {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  async initializeConnection(): Promise<void> {
    if (typeof window === "undefined") return;

    try {
      // Check if Keplr is installed
      if (!window.keplr) {
        this.updateState({
          error: "Keplr wallet is not installed. Please install Keplr extension.",
        });
        return;
      }

      // Try to get existing connection
      const offlineSigner = window.keplr.getOfflineSigner(CELESTIA_TESTNET_CONFIG.chainId);
      const accounts = await offlineSigner.getAccounts();

      if (accounts.length > 0) {
        this.updateState({
          isConnected: true,
          address: accounts[0].address,
          error: null,
        });
      }
    } catch (error) {
      console.warn("Failed to initialize wallet connection:", error);
    }
  }

  async connect(): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("Keplr can only be used in browser environment");
    }

    if (!window.keplr) {
      const error = "Keplr wallet is not installed. Please install Keplr extension.";
      this.updateState({ error });
      throw new Error(error);
    }

    try {
      this.updateState({ isConnecting: true, error: null });

      // Add Celestia Mocha testnet to Keplr if not already added
      try {
        await window.keplr.experimentalSuggestChain(CELESTIA_TESTNET_CONFIG);
      } catch (chainError) {
        console.warn("Failed to add Celestia testnet to Keplr:", chainError);
        // Continue anyway, chain might already be added
      }

      // Enable Keplr for Celestia testnet
      await window.keplr.enable(CELESTIA_TESTNET_CONFIG.chainId);

      // Get the offline signer
      const offlineSigner = window.keplr.getOfflineSigner(CELESTIA_TESTNET_CONFIG.chainId);
      const accounts = await offlineSigner.getAccounts();

      if (accounts.length === 0) {
        throw new Error("No accounts found in Keplr wallet");
      }

      const address = accounts[0].address;

      this.updateState({
        isConnected: true,
        address,
        isConnecting: false,
        error: null,
      });

      // Store in localStorage for persistence
      localStorage.setItem("keplr_connected", "true");
      localStorage.setItem("keplr_address", address);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect to Keplr wallet";
      this.updateState({
        isConnected: false,
        address: null,
        isConnecting: false,
        error: errorMessage,
      });
      throw new Error(errorMessage);
    }
  }

  async disconnect(): Promise<void> {
    this.updateState({
      isConnected: false,
      address: null,
      isConnecting: false,
      error: null,
    });

    // Clear localStorage
    localStorage.removeItem("keplr_connected");
    localStorage.removeItem("keplr_address");
  }

  getState(): WalletState {
    return { ...this.state };
  }

  isKeplrInstalled(): boolean {
    return typeof window !== "undefined" && !!window.keplr;
  }

  getInstallUrl(): string {
    return "https://chrome.google.com/webstore/detail/keplr/dmkamcknogkgcdfhhbddcghachkejeap";
  }

  /**
   * Get balance for connected address via broker (avoids CORS issues)
   */
  async getBalance(): Promise<{ utia: number; tia: number } | null> {
    if (!this.state.isConnected || !this.state.address) {
      return null;
    }

    try {
      // Use broker's balance endpoint to avoid CORS issues
      const response = await fetch(`http://localhost:9092/balance/${this.state.address}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const balanceData = await response.json();
      const utiaAmount = parseInt(balanceData.balance?.utia || '0');
      const tiaAmount = utiaAmount / 1_000_000; // Convert micro-TIA to TIA

      const balance = { utia: utiaAmount, tia: tiaAmount };

      // Update state with balance
      this.updateState({ balance });

      return balance;
    } catch (error) {
      console.error("Failed to get balance:", error);
      return null;
    }
  }

  /**
   * Sign and broadcast real payment transaction using proper CosmJS integration
   */
  async signAndBroadcast(
    recipientAddress: string,
    amount: string,
    memo: string
  ): Promise<PaymentTransaction> {
    if (!this.state.isConnected || !this.state.address) {
      return {
        txHash: "",
        success: false,
        error: "Wallet not connected"
      };
    }

    if (!window.keplr) {
      return {
        txHash: "",
        success: false,
        error: "Keplr not available"
      };
    }

    try {
      // Parse amount (should be in format "7240utia")
      const amountValue = amount.replace(/[^0-9]/g, "");

      console.log('Payment transaction:', {
        chainId: CELESTIA_TESTNET_CONFIG.chainId,
        from: this.state.address,
        to: recipientAddress,
        amount: amountValue,
        memo: memo
      });

      // Enable Keplr for the chain
      await window.keplr.enable(CELESTIA_TESTNET_CONFIG.chainId);

      // Get the offline signer
      const offlineSigner = window.keplr.getOfflineSigner(CELESTIA_TESTNET_CONFIG.chainId);
      const accounts = await offlineSigner.getAccounts();

      console.log('Got Keplr offline signer and accounts');

      // Get amino signer for transaction signing
      const aminoSigner = window.keplr.getOfflineSignerOnlyAmino(CELESTIA_TESTNET_CONFIG.chainId);

      console.log('Getting account info via API...');

      // Get account info via our API to avoid CORS
      const accountInfoResponse = await fetch(`/api/wallet/account-info?address=${this.state.address}`);
      const accountInfo = await accountInfoResponse.json();

      console.log('Account info received:', accountInfo);

      // Create transaction document with real account info
      const signDoc = {
        chain_id: CELESTIA_TESTNET_CONFIG.chainId,
        account_number: accountInfo.account_number?.toString() || "0",
        sequence: accountInfo.sequence?.toString() || "0",
        fee: {
          amount: [{ denom: "utia", amount: "50000" }],
          gas: "200000"
        },
        msgs: [{
          type: "cosmos-sdk/MsgSend",
          value: {
            from_address: this.state.address,
            to_address: recipientAddress,
            amount: [{ denom: "utia", amount: amountValue }]
          }
        }],
        memo: memo
      };

      console.log('🔐 Requesting signature from Keplr...', signDoc);

      // User signs with Keplr
      const signResult = await aminoSigner.signAmino(this.state.address, signDoc);

      console.log('✅ Signature received from Keplr');
      console.log('Sending signed tx via API...');

      // Broadcast via API route
      const response = await fetch('/api/wallet/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTx: signResult
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Broadcast failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Transaction failed');
      }

      console.log('Transaction successful!', {
        txHash: result.tx_hash,
        chargedWallet: this.state.address
      });

      // Refresh balance
      setTimeout(() => this.getBalance(), 3000);

      return {
        txHash: result.tx_hash,
        success: true,
        gasUsed: result.gas_used || 0,
        fee: "50000utia"
      };

    } catch (error) {
      console.error("Failed to execute transaction:", error);
      return {
        txHash: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Check if user can afford a transaction
   */
  async canAffordTransaction(amount: string, estimatedGas: number = 100000): Promise<{
    canAfford: boolean;
    currentBalance: number;
    requiredAmount: number;
    estimatedFee: number;
  }> {
    const balance = await this.getBalance();
    if (!balance) {
      return {
        canAfford: false,
        currentBalance: 0,
        requiredAmount: 0,
        estimatedFee: 0
      };
    }

    const amountValue = parseInt(amount.replace(/[^0-9]/g, ""));
    const estimatedFee = Math.ceil(estimatedGas * 0.02); // 0.02 utia per gas unit
    const requiredAmount = amountValue + estimatedFee;

    return {
      canAfford: balance.utia >= requiredAmount,
      currentBalance: balance.utia,
      requiredAmount,
      estimatedFee
    };
  }
}

export const keplrWallet = KeplrWallet.getInstance();
