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

const ERC20_TRANSFER_ABI =
  'event Transfer(address indexed from, address indexed to, uint256 value)';
const ERC20_METADATA_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
];

const erc20Interface = new ethers.Interface([ERC20_TRANSFER_ABI]);

const LOG_CHUNK_BLOCKS = 1000;
const DEFAULT_LOOKBACK_BLOCKS = 5000;
const LOG_FETCH_RETRIES = 3;
const RETRY_DELAY_MS = 750;
const PROVIDER_CONCURRENCY = 5;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function chunkArray<T>(values: T[], size: number): T[][] {
  if (size <= 0) {
    return [values];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

type ProviderLog = {
  address?: string;
  transactionHash?: string;
  blockNumber?: number;
  data?: string;
  topics?: string[];
};

type TokenMetadata = {
  symbol: string;
  decimals: number;
};

type Erc20MetadataContract = {
  symbol?: () => Promise<string>;
  decimals?: () => Promise<number>;
  balanceOf?: (address: string) => Promise<bigint>;
};

export class EthereumAdapter implements IBlockchainAdapter {
  readonly chain = ChainType.ETHEREUM;
  private provider?: ethers.JsonRpcProvider;
  private initialized = false;
  private tokenMetadataCache = new Map<string, TokenMetadata>();

  async initialize(config: BlockchainConfig): Promise<void> {
    if (this.initialized) {
      throw new Error('Adapter already initialized');
    }

    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.network);
    this.initialized = true;
  }

  private ensureProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      throw new Error('Adapter not initialized');
    }
    return this.provider;
  }

  isValidAddress(address: string): boolean {
    try {
      if (!address || !address.startsWith('0x') || address.length !== 42) {
        return false;
      }

      const hexRegex = /^0x[0-9a-fA-F]{40}$/;
      if (!hexRegex.test(address)) {
        return false;
      }

      try {
        ethers.getAddress(address);
        return true;
      } catch {
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
    if (!this.isValidAddress(address)) {
      throw new InvalidAddressError(this.chain, address);
    }

    const provider = this.ensureProvider();
    const normalizedAddress = address.toLowerCase();

    try {
      const latestBlock = options?.toBlock ?? (await provider.getBlockNumber());
      const fromBlock = await this.resolveFromBlock(options, latestBlock);
      const toBlock = await this.resolveToBlock(options, latestBlock);
      const effectiveFrom = Math.max(Math.min(fromBlock, toBlock), 0);
      const effectiveTo = toBlock;
      const limit = options?.limit ?? Number.POSITIVE_INFINITY;

      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      const addressTopic = ethers.zeroPadValue(normalizedAddress, 32);

      const groupedLogs = new Map<string, ProviderLog[]>();
      const processed = new Map<string, RawTransaction>();

      for (
        let chunkStart = effectiveFrom;
        chunkStart <= effectiveTo && processed.size < limit;
        chunkStart += LOG_CHUNK_BLOCKS
      ) {
        const chunkEnd = Math.min(chunkStart + LOG_CHUNK_BLOCKS - 1, effectiveTo);

        const [senderLogs, receiverLogs] = await Promise.all([
          this.fetchLogsWithRetry({
            fromBlock: chunkStart,
            toBlock: chunkEnd,
            topics: [transferTopic, addressTopic],
          }),
          this.fetchLogsWithRetry({
            fromBlock: chunkStart,
            toBlock: chunkEnd,
            topics: [transferTopic, null, addressTopic],
          }),
        ]);

        [...senderLogs, ...receiverLogs].forEach(log => {
          if (!log?.transactionHash) {
            return;
          }

          const normalized: ProviderLog = {
            address: log.address?.toLowerCase(),
            transactionHash: log.transactionHash,
            blockNumber:
              typeof log.blockNumber === 'number' ? log.blockNumber : Number(log.blockNumber ?? 0),
            data: log.data,
            topics: log.topics ? [...log.topics] : [],
          };

          const existing = groupedLogs.get(log.transactionHash);
          if (existing) {
            existing.push(normalized);
          } else {
            groupedLogs.set(log.transactionHash, [normalized]);
          }
        });

        const newHashes = Array.from(groupedLogs.keys()).filter(hash => !processed.has(hash));
        const batches = chunkArray(newHashes, PROVIDER_CONCURRENCY);

        for (const batch of batches) {
          if (processed.size >= limit) {
            break;
          }

          const results = await Promise.all(
            batch.map(async hash => {
              try {
                const [tx, receipt] = await Promise.all([
                  provider.getTransaction(hash),
                  provider.getTransactionReceipt(hash),
                ]);

                if (!tx || !receipt) {
                  return null;
                }

                const rawBlockNumber = receipt.blockNumber ?? tx.blockNumber;
                if (rawBlockNumber === undefined || rawBlockNumber === null) {
                  return null;
                }

                const blockNumber = Number(rawBlockNumber);
                if (!Number.isFinite(blockNumber)) {
                  return null;
                }

                const block = await provider.getBlock(blockNumber);
                if (!block) {
                  return null;
                }

                const logsForTx = groupedLogs.get(hash) ?? [];
                const tokenMetadata = await this.resolveTokenMetadata(
                  logsForTx.map(log => log.address)
                );

                const receiptGasPrice = (receipt as Partial<{ effectiveGasPrice?: bigint }>)
                  .effectiveGasPrice;
                const effectiveGasPrice = receiptGasPrice ?? tx.gasPrice ?? BigInt(0);
                const gasUsedValue = receipt.gasUsed ?? BigInt(0);
                const gasUsedBigInt =
                  typeof gasUsedValue === 'bigint' ? gasUsedValue : BigInt(gasUsedValue);
                const gasPriceBigInt =
                  typeof effectiveGasPrice === 'bigint'
                    ? effectiveGasPrice
                    : BigInt(effectiveGasPrice);
                const fee = gasUsedBigInt * gasPriceBigInt;

                const rawTx: RawTransaction = {
                  hash,
                  timestamp: block.timestamp * 1000,
                  from: (tx.from ?? '').toLowerCase(),
                  value: (tx.value ?? BigInt(0)).toString(),
                  fee: fee.toString(),
                  status: receipt.status === 1 ? 'success' : 'failed',
                  rawData: {
                    logs: logsForTx,
                    receiptLogs: receipt.logs,
                    gasUsed: gasUsedBigInt.toString(),
                    gasPrice: gasPriceBigInt.toString(),
                    tokenMetadata,
                  },
                };

                if (tx.to) {
                  rawTx.to = tx.to.toLowerCase();
                }
                rawTx.blockNumber = blockNumber;

                return rawTx;
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes('rate limit')) {
                  throw new RateLimitError(this.chain);
                }
                throw new NetworkError(this.chain, message, error);
              }
            })
          );

          for (const result of results) {
            if (result) {
              processed.set(result.hash, result);
              if (processed.size >= limit) {
                break;
              }
            }
          }
        }
      }

      const transactions = Array.from(processed.values()).sort((a, b) => {
        const blockDiff = (a.blockNumber ?? 0) - (b.blockNumber ?? 0);
        if (blockDiff !== 0) {
          return blockDiff;
        }
        return a.timestamp - b.timestamp;
      });

      if (Number.isFinite(limit)) {
        const start = options?.offset ?? 0;
        return transactions.slice(start, start + limit);
      }

      return options?.offset ? transactions.slice(options.offset) : transactions;
    } catch (error) {
      if (error instanceof BlockchainError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('rate limit')) {
        throw new RateLimitError(this.chain);
      }
      throw new NetworkError(this.chain, message, error);
    }
  }

  async parseTransaction(rawTx: RawTransaction): Promise<ParsedTransaction> {
    const parsed: ParsedTransaction = {
      hash: rawTx.hash,
      chain: this.chain,
      type: TransactionType.TRANSFER,
      from: rawTx.from,
      tokenSymbol: 'ETH',
      amount: rawTx.value ?? '0',
      timestamp: new Date(rawTx.timestamp),
      status: rawTx.status,
      metadata: rawTx.rawData ?? {},
    };

    if (rawTx.fee) {
      parsed.feeAmount = rawTx.fee;
    }

    if (rawTx.to) {
      parsed.to = rawTx.to;
      parsed.tokenAddress = rawTx.to;
    }

    if (rawTx.blockNumber !== undefined) {
      parsed.blockNumber = rawTx.blockNumber;
    }

    const logs: ProviderLog[] = (rawTx.rawData?.logs as ProviderLog[]) ?? [];
    const transfers = logs
      .map(log => this.decodeTransferLog(log))
      .filter((value): value is { address: string; from: string; to: string; value: bigint } =>
        Boolean(value)
      );

    if (transfers.length > 0) {
      const primary = transfers[0];
      if (primary) {
        parsed.type = transfers.length > 1 ? TransactionType.SWAP : TransactionType.TRANSFER;
        parsed.from = primary.from;
        parsed.to = primary.to;
        parsed.amount = primary.value.toString();
        parsed.tokenAddress = primary.address;

        const tokenMetadata = rawTx.rawData?.tokenMetadata as
          | Record<string, TokenMetadata>
          | undefined;
        const metadataForToken = tokenMetadata?.[primary.address];
        if (metadataForToken) {
          parsed.tokenSymbol = metadataForToken.symbol;
        } else if (rawTx.to && rawTx.to !== parsed.to) {
          parsed.tokenSymbol = 'ERC20';
        }

        parsed.metadata = {
          ...rawTx.rawData,
          decodedTransfers: transfers.map(transfer => ({
            address: transfer.address,
            from: transfer.from,
            to: transfer.to,
            value: transfer.value.toString(),
          })),
        };
      }
    }

    return parsed;
  }

  async getBalance(address: string, tokenAddress?: string): Promise<WalletBalance[]> {
    const provider = this.ensureProvider();

    if (!this.isValidAddress(address)) {
      throw new InvalidAddressError(this.chain, address);
    }

    if (!tokenAddress) {
      const balance = await provider.getBalance(address);
      return [
        {
          address,
          chain: this.chain,
          tokenSymbol: 'ETH',
          balance: balance.toString(),
          decimals: 18,
        },
      ];
    }

    try {
      const contract = new ethers.Contract(
        tokenAddress,
        ERC20_METADATA_ABI,
        provider
      ) as unknown as Erc20MetadataContract;
      const [balance, decimals, symbol] = await Promise.all([
        contract?.balanceOf?.(address) ?? Promise.resolve(0n),
        contract?.decimals?.() ?? Promise.resolve(18),
        contract?.symbol?.() ?? Promise.resolve('ERC20'),
      ]);

      return [
        {
          address,
          chain: this.chain,
          tokenSymbol: symbol?.toString?.() ?? 'ERC20',
          tokenAddress,
          balance: balance.toString(),
          decimals: Number(decimals ?? 18),
        },
      ];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NetworkError(this.chain, `Failed to get token balance: ${message}`, error);
    }
  }

  async getTransactionByHash(hash: string): Promise<RawTransaction | null> {
    const provider = this.ensureProvider();

    try {
      const tx = await provider.getTransaction(hash);
      if (!tx) {
        return null;
      }

      const receipt = await provider.getTransactionReceipt(hash);
      const rawBlockNumber = receipt?.blockNumber ?? tx.blockNumber;
      if (!receipt || rawBlockNumber === undefined || rawBlockNumber === null) {
        return null;
      }

      const blockNumber = Number(rawBlockNumber);
      if (!Number.isFinite(blockNumber)) {
        return null;
      }

      const block = await provider.getBlock(blockNumber);
      if (!block) {
        return null;
      }

      const receiptGasPrice = (receipt as Partial<{ effectiveGasPrice?: bigint }>)
        .effectiveGasPrice;
      const effectiveGasPrice = receiptGasPrice ?? tx.gasPrice ?? BigInt(0);
      const gasUsedValue = receipt.gasUsed ?? BigInt(0);
      const gasUsedBigInt = typeof gasUsedValue === 'bigint' ? gasUsedValue : BigInt(gasUsedValue);
      const gasPriceBigInt =
        typeof effectiveGasPrice === 'bigint' ? effectiveGasPrice : BigInt(effectiveGasPrice);
      const fee = gasUsedBigInt * gasPriceBigInt;

      const tokenMetadata = await this.resolveTokenMetadata(
        (receipt.logs ?? []).map(log => log.address)
      );

      const rawTx: RawTransaction = {
        hash: tx.hash,
        timestamp: block.timestamp * 1000,
        from: (tx.from ?? '').toLowerCase(),
        value: (tx.value ?? BigInt(0)).toString(),
        fee: fee.toString(),
        status: receipt.status === 1 ? 'success' : 'failed',
        blockNumber,
        rawData: {
          logs: receipt.logs,
          gasUsed: gasUsedBigInt.toString(),
          gasPrice: gasPriceBigInt.toString(),
          tokenMetadata,
        },
      };

      if (tx.to) {
        rawTx.to = tx.to.toLowerCase();
      }

      return rawTx;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NetworkError(this.chain, message, error);
    }
  }

  async getCurrentBlockNumber(): Promise<number> {
    const provider = this.ensureProvider();

    try {
      return await provider.getBlockNumber();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NetworkError(this.chain, message, error);
    }
  }

  private async fetchLogsWithRetry(filter: ethers.Filter, retries = LOG_FETCH_RETRIES) {
    const provider = this.ensureProvider();
    let attempt = 0;
    while (attempt <= retries) {
      try {
        return await provider.getLogs(filter);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('rate limit')) {
          attempt += 1;
          if (attempt > retries) {
            throw new RateLimitError(this.chain);
          }
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        if (message.includes('range is too large')) {
          throw new NetworkError(this.chain, 'Block range too large for provider', error);
        }
        throw new NetworkError(this.chain, message || 'Failed to fetch logs', error);
      }
    }
    return [];
  }

  private async resolveTokenMetadata(
    addresses: (string | undefined)[]
  ): Promise<Record<string, TokenMetadata>> {
    const provider = this.ensureProvider();
    const metadata: Record<string, TokenMetadata> = {};
    const uniqueAddresses = Array.from(
      new Set(
        addresses.filter((addr): addr is string => Boolean(addr)).map(addr => addr!.toLowerCase())
      )
    );

    for (const tokenAddress of uniqueAddresses) {
      if (!this.tokenMetadataCache.has(tokenAddress)) {
        try {
          const contract = new ethers.Contract(
            tokenAddress,
            ERC20_METADATA_ABI,
            provider
          ) as unknown as Erc20MetadataContract;
          const [symbol, decimals] = await Promise.all([
            contract?.symbol?.().catch(() => 'ERC20'),
            contract?.decimals?.().catch(() => 18),
          ]);
          this.tokenMetadataCache.set(tokenAddress, {
            symbol: symbol?.toString?.() ?? 'ERC20',
            decimals: Number(decimals ?? 18),
          });
        } catch {
          this.tokenMetadataCache.set(tokenAddress, {
            symbol: 'ERC20',
            decimals: 18,
          });
        }
      }

      const info = this.tokenMetadataCache.get(tokenAddress);
      if (info) {
        metadata[tokenAddress] = info;
      }
    }

    return metadata;
  }

  private decodeTransferLog(log: ProviderLog) {
    if (!log?.data || !log.topics || log.topics.length === 0 || !log.address) {
      return null;
    }

    try {
      const parsed = erc20Interface.parseLog({ topics: [...log.topics], data: log.data });
      const from = (parsed?.args?.[0] as string | undefined)?.toLowerCase();
      const to = (parsed?.args?.[1] as string | undefined)?.toLowerCase();
      const value = parsed?.args?.[2] as bigint | undefined;

      if (!from || !to || value === undefined) {
        return null;
      }

      return {
        address: log.address.toLowerCase(),
        from,
        to,
        value: typeof value === 'bigint' ? value : BigInt(value),
      };
    } catch {
      return null;
    }
  }

  private async resolveFromBlock(
    options:
      | {
          fromBlock?: number;
          fromDate?: Date;
        }
      | undefined,
    latestBlock: number
  ): Promise<number> {
    if (typeof options?.fromBlock === 'number') {
      return options.fromBlock;
    }

    if (options?.fromDate) {
      return this.getBlockForTimestamp(options.fromDate, latestBlock);
    }

    return Math.max(latestBlock - DEFAULT_LOOKBACK_BLOCKS, 0);
  }

  private async resolveToBlock(
    options:
      | {
          toBlock?: number;
          toDate?: Date;
        }
      | undefined,
    latestBlock: number
  ): Promise<number> {
    let resolved = typeof options?.toBlock === 'number' ? options.toBlock : latestBlock;

    if (options?.toDate) {
      const blockForDate = await this.getBlockForTimestamp(options.toDate, latestBlock);
      resolved = Math.min(resolved, blockForDate);
    }

    return resolved;
  }

  private async getBlockForTimestamp(targetDate: Date, latestBlock: number): Promise<number> {
    const provider = this.ensureProvider();
    const target = Math.floor(targetDate.getTime() / 1000);

    let low = 0;
    let high = latestBlock;
    let candidate = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const block = await provider.getBlock(mid);
      if (!block?.timestamp) {
        high = mid - 1;
        continue;
      }

      if (block.timestamp <= target) {
        candidate = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return candidate;
  }
}
