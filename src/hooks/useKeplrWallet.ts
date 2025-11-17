import { useState, useEffect, useCallback } from 'react';
import { keplrWallet, WalletState } from '@/lib/wallet/keplr';

export function useKeplrWallet() {
  const [state, setState] = useState<WalletState>(keplrWallet.getState());

  useEffect(() => {
    const unsubscribe = keplrWallet.subscribe(setState);
    return unsubscribe;
  }, []);

  const connect = useCallback(async () => {
    try {
      await keplrWallet.connect();
    } catch (error) {
      console.error('Failed to connect to Keplr:', error);
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await keplrWallet.disconnect();
    } catch (error) {
      console.error('Failed to disconnect from Keplr:', error);
      throw error;
    }
  }, []);

  const isKeplrInstalled = useCallback(() => {
    return keplrWallet.isKeplrInstalled();
  }, []);

  const getInstallUrl = useCallback(() => {
    return keplrWallet.getInstallUrl();
  }, []);

  const getBalance = useCallback(async () => {
    return await keplrWallet.getBalance();
  }, []);

  const signAndBroadcast = useCallback(async (
    recipientAddress: string,
    amount: string,
    memo: string
  ) => {
    return await keplrWallet.signAndBroadcast(recipientAddress, amount, memo);
  }, []);

  const canAffordTransaction = useCallback(async (
    amount: string,
    estimatedGas?: number
  ) => {
    return await keplrWallet.canAffordTransaction(amount, estimatedGas);
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    isKeplrInstalled,
    getInstallUrl,
    getBalance,
    signAndBroadcast,
    canAffordTransaction,
  };
}
