import * as bitcoin from 'bitcoinjs-lib';
import axios, { AxiosInstance } from 'axios';
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

export class BitcoinAdapter implements IBlockchainAdapter {
  readonly chain = ChainType.BITCOIN;
  private apiClient?: AxiosInstance;
  private initialized = false;
  private network: bitcoin.Network = bitcoin.networks.bitcoin;

  async initialize(config: BlockchainConfig): Promise<void> {
    if (this.initialized) {
      throw new Error('Adapter already initialized');
    }

    // Bitcoin uses external APIs for transaction data
    // Common APIs: BlockCypher, Blockchain.info, Blockstream, etc.
    this.apiClient = axios.create({
      baseURL: config.rpcUrl,
      timeout: 30000,
      headers: config.apiKey ? { 'X-API-Key': config.apiKey } : {},
    });

    if (config.network === 'testnet') {
      this.network = bitcoin.networks.testnet;
    }

    this.initialized = true;
  }

  isValidAddress(address: string): boolean {
    try {
      if (!address) {
        return false;
      }

      // Check for Ethereum addresses (start with 0x)
      if (address.startsWith('0x')) {
        return false;
      }

      // Try to decode the address - this will throw if invalid
      bitcoin.address.toOutputScript(address, this.network);
      return true;
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
    if (!this.apiClient) {
      throw new Error('Adapter not initialized');
    }

    if (!this.isValidAddress(address)) {
      throw new InvalidAddressError(this.chain, address);
    }

    try {
      // Using BlockCypher API format as example
      // Different APIs have different formats
      const endpoint = `/addrs/${address}/full`;
      const params: any = {
        limit: options?.limit || 50,
      };

      if (options?.offset) {
        params.after = options.offset;
      }

      const response = await this.apiClient.get(endpoint, { params });
      const data = response.data;

      const transactions: RawTransaction[] = [];

      // Parse transactions from API response
      if (data.txs) {
        for (const tx of data.txs) {
          const rawTx: RawTransaction = {
            hash: tx.txid || tx.hash,
            timestamp: tx.time ? tx.time * 1000 : Date.now(),
            from: address, // Bitcoin doesn't have simple from/to
            value: this.calculateTransactionValue(tx, address).toString(),
            fee: (tx.fee || 0).toString(),
            status: tx.confirmations > 0 ? 'success' : 'pending',
            rawData: tx,
          };

          if (tx.blockheight) {
            rawTx.blockNumber = tx.blockheight;
          }

          // Try to determine recipient
          if (tx.outputs && tx.outputs.length > 0) {
            for (const output of tx.outputs) {
              if (output.addresses && output.addresses[0] !== address) {
                rawTx.to = output.addresses[0];
                break;
              }
            }
          }

          transactions.push(rawTx);
        }
      }

      return transactions;
    } catch (error: any) {
      if (error instanceof BlockchainError) {
        throw error;
      }
      if (error.response?.status === 429) {
        throw new RateLimitError(this.chain);
      }
      throw new NetworkError(this.chain, error.message, error);
    }
  }

  private calculateTransactionValue(tx: any, address: string): number {
    let value = 0;

    // Calculate net value for the address
    // Sum outputs to this address
    if (tx.outputs) {
      for (const output of tx.outputs) {
        if (output.addresses && output.addresses.includes(address)) {
          value += output.value || 0;
        }
      }
    }

    // Subtract inputs from this address
    if (tx.inputs) {
      for (const input of tx.inputs) {
        if (input.addresses && input.addresses.includes(address)) {
          value -= input.value || 0;
        }
      }
    }

    return Math.abs(value);
  }

  async parseTransaction(rawTx: RawTransaction): Promise<ParsedTransaction> {
    const parsed: ParsedTransaction = {
      hash: rawTx.hash,
      chain: this.chain,
      type: TransactionType.TRANSFER,
      from: rawTx.from,
      tokenSymbol: 'BTC',
      amount: rawTx.value || '0',
      timestamp: new Date(rawTx.timestamp),
      status: rawTx.status,
      metadata: rawTx.rawData || {},
    };

    if (rawTx.to) {
      parsed.to = rawTx.to;
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
    if (!this.apiClient) {
      throw new Error('Adapter not initialized');
    }

    if (!this.isValidAddress(address)) {
      throw new InvalidAddressError(this.chain, address);
    }

    // Bitcoin doesn't have tokens like Ethereum/Solana
    if (tokenAddress) {
      return [];
    }

    try {
      // Using BlockCypher API format
      const endpoint = `/addrs/${address}/balance`;
      const response = await this.apiClient.get(endpoint);
      const data = response.data;

      return [
        {
          address,
          chain: this.chain,
          tokenSymbol: 'BTC',
          balance: (data.balance || 0).toString(),
          decimals: 8, // Bitcoin has 8 decimal places
        },
      ];
    } catch (error: any) {
      throw new NetworkError(this.chain, error.message, error);
    }
  }

  async getTransactionByHash(hash: string): Promise<RawTransaction | null> {
    if (!this.apiClient) {
      throw new Error('Adapter not initialized');
    }

    try {
      // Using BlockCypher API format
      const endpoint = `/txs/${hash}`;
      const response = await this.apiClient.get(endpoint);
      const tx = response.data;

      // Extract the primary address (first input)
      let fromAddress = '';
      if (tx.inputs && tx.inputs.length > 0 && tx.inputs[0].addresses) {
        fromAddress = tx.inputs[0].addresses[0];
      }

      const rawTx: RawTransaction = {
        hash: tx.txid || tx.hash || hash,
        timestamp: tx.time ? tx.time * 1000 : Date.now(),
        from: fromAddress,
        value: (tx.value_out || 0).toString(),
        fee: (tx.fee || 0).toString(),
        status: tx.confirmations > 0 ? 'success' : 'pending',
        rawData: tx,
      };

      if (tx.blockheight) {
        rawTx.blockNumber = tx.blockheight;
      }

      // Extract primary recipient
      if (tx.outputs && tx.outputs.length > 0) {
        for (const output of tx.outputs) {
          if (output.addresses && output.addresses[0] !== fromAddress) {
            rawTx.to = output.addresses[0];
            rawTx.value = output.value.toString();
            break;
          }
        }
      }

      return rawTx;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new NetworkError(this.chain, error.message, error);
    }
  }

  async getCurrentBlockNumber(): Promise<number> {
    if (!this.apiClient) {
      throw new Error('Adapter not initialized');
    }

    try {
      // Using BlockCypher API format
      const response = await this.apiClient.get('');
      return response.data.height || 0;
    } catch (error: any) {
      throw new NetworkError(this.chain, error.message, error);
    }
  }
}
