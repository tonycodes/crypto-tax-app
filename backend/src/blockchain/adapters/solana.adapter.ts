import * as web3 from '@solana/web3.js';
import {
  IBlockchainAdapter,
  BlockchainConfig,
  ChainType,
  RawTransaction,
  ParsedTransaction,
  WalletBalance,
  TransactionType,
  BlockchainError,
  InvalidAddressError,
  NetworkError,
  RateLimitError,
} from './adapter.interface';

export class SolanaAdapter implements IBlockchainAdapter {
  readonly chain = ChainType.SOLANA;
  private connection?: web3.Connection;
  private initialized = false;

  async initialize(config: BlockchainConfig): Promise<void> {
    if (this.initialized) {
      throw new Error('Adapter already initialized');
    }

    this.connection = new web3.Connection(config.rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });
    this.initialized = true;
  }

  isValidAddress(address: string): boolean {
    try {
      // Check if it's a valid Solana public key
      // Solana addresses are typically 32-44 characters
      if (!address || address.length < 32 || address.length > 44) {
        return false;
      }

      // Reject if it starts with 0x (Ethereum address)
      if (address.startsWith('0x')) {
        return false;
      }

      // Check for valid base58 characters (Solana uses base58)
      if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) {
        return false;
      }

      // Try to create a PublicKey object
      const pubkey = new web3.PublicKey(address);

      // Verify it's on curve (valid public key)
      return web3.PublicKey.isOnCurve(pubkey.toBuffer());
    } catch {
      return false;
    }
  }

  async getTransactions(
    address: string,
    options?: {
      fromBlock?: number;
      toBlock?: number;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<RawTransaction[]> {
    if (!this.connection) {
      throw new Error('Adapter not initialized');
    }

    if (!this.isValidAddress(address)) {
      throw new InvalidAddressError(this.chain, address);
    }

    try {
      const pubkey = new web3.PublicKey(address);
      const transactions: RawTransaction[] = [];

      // Get signatures for the address
      const signatures = await this.connection.getSignaturesForAddress(pubkey, {
        limit: options?.limit || 100,
      });

      // Fetch full transaction details for each signature
      for (const sig of signatures) {
        try {
          const txResponse: web3.ParsedTransactionWithMeta | null =
            await this.connection.getParsedTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
            });

          if (txResponse) {
            const rawTx: RawTransaction = {
              hash: sig.signature,
              timestamp: (txResponse.blockTime || 0) * 1000, // Convert to milliseconds
              from: address,
              fee: txResponse.meta?.fee?.toString() || '0',
              status: txResponse.meta?.err ? 'failed' : 'success',
              rawData: {
                slot: txResponse.slot,
                meta: txResponse.meta,
                transaction: txResponse.transaction,
              },
            };

            if (txResponse.slot) {
              rawTx.blockNumber = txResponse.slot;
            }

            // Extract destination from transaction
            const txAccountKeys: any[] | undefined = txResponse.transaction.message.accountKeys;
            if (txAccountKeys && txAccountKeys.length > 1) {
              // Find the first account that isn't the sender
              for (const key of txAccountKeys) {
                const keyAddress = key.pubkey.toString();
                if (keyAddress !== address) {
                  rawTx.to = keyAddress;
                  break;
                }
              }
            }

            // Extract transfer amount from balance changes
            if (txResponse.meta?.postBalances && txResponse.meta?.preBalances && txAccountKeys) {
              const senderIndex = txAccountKeys.findIndex(
                (key: any) => key.pubkey.toString() === address
              );
              if (
                senderIndex !== -1 &&
                txResponse.meta.postBalances[senderIndex] !== undefined &&
                txResponse.meta.preBalances[senderIndex] !== undefined
              ) {
                const balanceChange = Math.abs(
                  txResponse.meta.postBalances[senderIndex] -
                    txResponse.meta.preBalances[senderIndex]
                );
                rawTx.value = balanceChange.toString();
              }
            }

            transactions.push(rawTx);
          }
        } catch (error: any) {
          // Skip individual transaction errors
          console.warn(`Failed to fetch transaction ${sig.signature}:`, error.message);
        }
      }

      return transactions;
    } catch (error: any) {
      if (error instanceof BlockchainError) {
        throw error;
      }
      if (error.message?.includes('429') || error.message?.includes('rate')) {
        throw new RateLimitError(this.chain);
      }
      throw new NetworkError(this.chain, error.message, error);
    }
  }

  async parseTransaction(rawTx: RawTransaction): Promise<ParsedTransaction> {
    let type = TransactionType.TRANSFER;
    let tokenSymbol = 'SOL';
    let tokenAddress: string | undefined;
    let amount = rawTx.value || '0';

    // Check if it's an SPL token transfer
    if (rawTx.rawData?.tokenTransfer) {
      tokenSymbol = 'SPL';
      tokenAddress = rawTx.rawData.tokenTransfer.mint;
      amount = rawTx.rawData.tokenTransfer.amount || '0';
    }

    // Detect swap transactions (simplified)
    if (rawTx.rawData?.transaction?.message?.instructions?.length > 2) {
      // Multiple instructions often indicate a swap
      const instructions = rawTx.rawData.transaction.message.instructions;
      const hasSwapProgram = instructions.some(
        (inst: any) =>
          inst.programId?.toString().includes('JUP') || // Jupiter
          inst.programId?.toString().includes('Raydium') || // Raydium
          inst.programId?.toString().includes('whirLbMiicVdio') // Orca
      );
      if (hasSwapProgram) {
        type = TransactionType.SWAP;
      }
    }

    const parsed: ParsedTransaction = {
      hash: rawTx.hash,
      chain: this.chain,
      type,
      from: rawTx.from,
      tokenSymbol,
      amount,
      timestamp: new Date(rawTx.timestamp),
      status: rawTx.status,
      metadata: rawTx.rawData || {},
    };

    if (rawTx.to) {
      parsed.to = rawTx.to;
    }

    if (tokenAddress) {
      parsed.tokenAddress = tokenAddress;
    }

    if (rawTx.fee) {
      parsed.feeAmount = rawTx.fee;
    }

    if (rawTx.blockNumber) {
      parsed.blockNumber = rawTx.blockNumber;
    }

    return parsed;
  }

  async getBalance(address: string, tokenAddress?: string): Promise<WalletBalance[]> {
    if (!this.connection) {
      throw new Error('Adapter not initialized');
    }

    if (!this.isValidAddress(address)) {
      throw new InvalidAddressError(this.chain, address);
    }

    const balances: WalletBalance[] = [];

    try {
      const pubkey = new web3.PublicKey(address);

      if (!tokenAddress) {
        // Get SOL balance
        const balance = await this.connection.getBalance(pubkey);
        balances.push({
          address,
          chain: this.chain,
          tokenSymbol: 'SOL',
          balance: balance.toString(),
          decimals: 9, // SOL has 9 decimals
        });
      } else {
        // Get SPL token balance
        // This would require fetching token accounts and parsing them
        // Simplified for now
        balances.push({
          address,
          chain: this.chain,
          tokenSymbol: 'SPL',
          tokenAddress,
          balance: '0', // Would need actual token account fetching
          decimals: 6, // Most common, but should be fetched from mint
        });
      }

      return balances;
    } catch (error: any) {
      throw new NetworkError(this.chain, error.message, error);
    }
  }

  async getTransactionByHash(hash: string): Promise<RawTransaction | null> {
    if (!this.connection) {
      throw new Error('Adapter not initialized');
    }

    try {
      const tx = await this.connection.getParsedTransaction(hash, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return null;
      }

      const accountKeys = tx.transaction.message.accountKeys;
      const from = accountKeys[0]?.pubkey.toString() || '';

      const rawTx: RawTransaction = {
        hash,
        timestamp: (tx.blockTime || 0) * 1000,
        from,
        fee: tx.meta?.fee?.toString() || '0',
        status: tx.meta?.err ? 'failed' : 'success',
        rawData: {
          slot: tx.slot,
          meta: tx.meta,
          transaction: tx.transaction,
        },
      };

      if (tx.slot) {
        rawTx.blockNumber = tx.slot;
      }

      // Extract destination
      if (accountKeys.length > 1 && accountKeys[1]) {
        rawTx.to = accountKeys[1].pubkey.toString();
      }

      // Extract transfer amount
      if (
        tx.meta?.postBalances &&
        tx.meta?.preBalances &&
        tx.meta.postBalances[0] !== undefined &&
        tx.meta.preBalances[0] !== undefined
      ) {
        const balanceChange = Math.abs(tx.meta.postBalances[0] - tx.meta.preBalances[0]);
        rawTx.value = balanceChange.toString();
      }

      return rawTx;
    } catch (error: any) {
      throw new NetworkError(this.chain, error.message, error);
    }
  }

  async getCurrentBlockNumber(): Promise<number> {
    if (!this.connection) {
      throw new Error('Adapter not initialized');
    }

    try {
      return await this.connection.getSlot();
    } catch (error: any) {
      throw new NetworkError(this.chain, error.message, error);
    }
  }
}
