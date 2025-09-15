import { ethers } from 'ethers';
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

export class EthereumAdapter implements IBlockchainAdapter {
  readonly chain = ChainType.ETHEREUM;
  private provider?: ethers.JsonRpcProvider;
  private initialized = false;

  async initialize(config: BlockchainConfig): Promise<void> {
    if (this.initialized) {
      throw new Error('Adapter already initialized');
    }

    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.initialized = true;
  }

  isValidAddress(address: string): boolean {
    try {
      // Check if it's a valid Ethereum address format
      if (!address || !address.startsWith('0x') || address.length !== 42) {
        return false;
      }

      // Check if it contains only hex characters
      const hexRegex = /^0x[0-9a-fA-F]{40}$/;
      if (!hexRegex.test(address)) {
        return false;
      }

      // Use ethers to validate checksum if present
      try {
        ethers.getAddress(address);
        return true;
      } catch {
        // Address format is valid but checksum might be wrong
        // We'll still accept it as valid
        return true;
      }
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
    if (!this.provider) {
      throw new Error('Adapter not initialized');
    }

    if (!this.isValidAddress(address)) {
      throw new InvalidAddressError(this.chain, address);
    }

    try {
      const transactions: RawTransaction[] = [];

      // Get transfer events where address is sender or receiver
      const fromBlock = options?.fromBlock || 'earliest';
      const toBlock = options?.toBlock || 'latest';

      // Get logs for Transfer events
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      const addressTopic = ethers.zeroPadValue(address.toLowerCase(), 32);

      // Handle block range limits (most RPCs limit to 1000-2000 blocks per query)
      const MAX_BLOCK_RANGE = 1000;
      let logs: any[] = [];

      // Calculate block ranges to query
      const startBlock = typeof fromBlock === 'string' ? 0 : fromBlock;
      const endBlock = typeof toBlock === 'string' ? await this.provider.getBlockNumber() : toBlock;

      // Process in chunks if range is too large
      for (let currentFrom = startBlock; currentFrom <= endBlock; currentFrom += MAX_BLOCK_RANGE) {
        const currentTo = Math.min(currentFrom + MAX_BLOCK_RANGE - 1, endBlock);

        // Retry logic for rate limiting
        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
          try {
            // Get logs where address is the sender
            const senderLogs = await this.provider.getLogs({
              fromBlock: currentFrom,
              toBlock: currentTo,
              topics: [transferTopic, addressTopic] as any,
            });

            // Get logs where address is the receiver
            const receiverLogs = await this.provider.getLogs({
              fromBlock: currentFrom,
              toBlock: currentTo,
              topics: [transferTopic, null, addressTopic] as any,
            });

            // Ensure logs are arrays before spreading
            const senderLogsArray = Array.isArray(senderLogs) ? senderLogs : [];
            const receiverLogsArray = Array.isArray(receiverLogs) ? receiverLogs : [];
            logs = [...logs, ...senderLogsArray, ...receiverLogsArray];
            break;
          } catch (error: any) {
            if (error.message?.includes('rate limit')) {
              retries++;
              if (retries >= maxRetries) {
                throw new RateLimitError(this.chain);
              }
              await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            } else if (error.message?.includes('range is too large')) {
              // If still too large, break it down further
              throw new NetworkError(
                this.chain,
                'Block range too large. Please use smaller ranges.',
                error
              );
            } else {
              throw error;
            }
          }
        }
      }

      // Process logs into transactions
      for (const log of logs || []) {
        const tx = await this.provider.getTransaction(log.transactionHash);
        const receipt = await this.provider.getTransactionReceipt(log.transactionHash);
        const block = await this.provider.getBlock(log.blockNumber);

        if (tx && receipt && block) {
          const fee = receipt.gasUsed * (tx.gasPrice || BigInt(0));

          const rawTx: RawTransaction = {
            hash: tx.hash,
            timestamp: block.timestamp * 1000,
            from: tx.from.toLowerCase(),
            value: tx.value.toString(),
            fee: fee.toString(),
            status: receipt.status === 1 ? 'success' : 'failed',
            rawData: {
              logs: receipt.logs,
              gasUsed: receipt.gasUsed.toString(),
              gasPrice: tx.gasPrice?.toString(),
            },
          };

          if (tx.blockNumber) {
            rawTx.blockNumber = tx.blockNumber;
          }

          if (tx.to) {
            rawTx.to = tx.to.toLowerCase();
          }

          transactions.push(rawTx);
        }
      }

      // Apply limit if specified
      if (options?.limit) {
        return transactions.slice(0, options.limit);
      }

      return transactions;
    } catch (error: any) {
      if (error instanceof BlockchainError) {
        throw error;
      }
      throw new NetworkError(this.chain, error.message, error);
    }
  }

  async parseTransaction(rawTx: RawTransaction): Promise<ParsedTransaction> {
    let type = TransactionType.TRANSFER;
    let tokenSymbol = 'ETH';
    let tokenAddress: string | undefined;
    let amount = rawTx.value || '0';

    // Check if it's an ERC20 transfer
    if (rawTx.rawData?.logs?.length > 0) {
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      const transferLog = rawTx.rawData.logs.find((log: any) => log.topics?.[0] === transferTopic);

      if (transferLog) {
        tokenSymbol = 'ERC20'; // Would need token metadata lookup in production
        tokenAddress = rawTx.to;
        // Decode the amount from log data
        if (transferLog.data) {
          try {
            // Convert hex string to BigInt
            amount = BigInt(transferLog.data).toString();
          } catch (e) {
            // If parsing fails, use the raw value
            amount = '0';
          }
        }
      }
    }

    // Detect swap transactions (simplified - would need more complex logic)
    if (
      rawTx.rawData?.logs?.filter(
        (log: any) => log.topics?.[0] === ethers.id('Transfer(address,address,uint256)')
      ).length > 1
    ) {
      type = TransactionType.SWAP;
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
    if (!this.provider) {
      throw new Error('Adapter not initialized');
    }

    if (!this.isValidAddress(address)) {
      throw new InvalidAddressError(this.chain, address);
    }

    const balances: WalletBalance[] = [];

    if (!tokenAddress) {
      // Get ETH balance
      const balance = await this.provider.getBalance(address);
      balances.push({
        address,
        chain: this.chain,
        tokenSymbol: 'ETH',
        balance: balance.toString(),
        decimals: 18,
      });
    } else {
      // Get ERC20 token balance
      const erc20Abi = [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
      ];

      try {
        const contract = new ethers.Contract(tokenAddress, erc20Abi, this.provider);
        const balanceOf = contract['balanceOf'] as (address: string) => Promise<bigint>;
        const getDecimals = contract['decimals'] as () => Promise<number>;
        const getSymbol = contract['symbol'] as () => Promise<string>;

        const [balance, decimals, symbol] = await Promise.all([
          balanceOf(address),
          getDecimals(),
          getSymbol(),
        ]);

        balances.push({
          address,
          chain: this.chain,
          tokenSymbol: symbol.toString(),
          tokenAddress,
          balance: balance.toString(),
          decimals: Number(decimals),
        });
      } catch (error: any) {
        throw new NetworkError(this.chain, `Failed to get token balance: ${error.message}`, error);
      }
    }

    return balances;
  }

  async getTransactionByHash(hash: string): Promise<RawTransaction | null> {
    if (!this.provider) {
      throw new Error('Adapter not initialized');
    }

    try {
      const tx = await this.provider.getTransaction(hash);
      if (!tx) {
        return null;
      }

      const receipt = await this.provider.getTransactionReceipt(hash);
      const block = await this.provider.getBlock(tx.blockNumber!);

      if (!receipt || !block) {
        return null;
      }

      const fee = receipt.gasUsed * (tx.gasPrice || BigInt(0));

      const rawTx: RawTransaction = {
        hash: tx.hash,
        timestamp: block.timestamp * 1000,
        from: tx.from.toLowerCase(),
        value: tx.value.toString(),
        fee: fee.toString(),
        status: receipt.status === 1 ? 'success' : 'failed',
        rawData: {
          logs: receipt.logs,
          gasUsed: receipt.gasUsed.toString(),
          gasPrice: tx.gasPrice?.toString(),
        },
      };

      if (tx.blockNumber) {
        rawTx.blockNumber = tx.blockNumber;
      }

      if (tx.to) {
        rawTx.to = tx.to.toLowerCase();
      }

      return rawTx;
    } catch (error: any) {
      throw new NetworkError(this.chain, error.message, error);
    }
  }

  async getCurrentBlockNumber(): Promise<number> {
    if (!this.provider) {
      throw new Error('Adapter not initialized');
    }

    try {
      return await this.provider.getBlockNumber();
    } catch (error: any) {
      throw new NetworkError(this.chain, error.message, error);
    }
  }
}
