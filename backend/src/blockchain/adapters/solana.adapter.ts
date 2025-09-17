import * as web3 from '@solana/web3.js';
import { extract as extractJupiter, SwapAttributes } from '@jup-ag/instruction-parser';
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
import { priceService } from '../../pricing/price.service';

const RAYDIUM_PROGRAM_IDS = new Set([
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Nd',
  'RVKd61ztZW9JU7V2aU7D1JQjoXnR8nDzWnRmN7bP2Ce',
]);

const DEFAULT_SIGNATURE_LIMIT = 50;

// Utility function for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class SolanaAdapter implements IBlockchainAdapter {
  readonly chain = ChainType.SOLANA;
  private connection?: web3.Connection;
  private initialized = false;
  private config?: BlockchainConfig;

  async initialize(config: BlockchainConfig): Promise<void> {
    if (this.initialized) {
      throw new Error('Adapter already initialized');
    }

    this.config = config;
    this.connection = new web3.Connection(config.rpcUrl, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: config.rateLimitMs ?? 60_000,
    });
    this.initialized = true;
  }

  private ensureConnection(): web3.Connection {
    if (!this.connection) {
      throw new Error('Adapter not initialized');
    }
    return this.connection;
  }

  isValidAddress(address: string): boolean {
    try {
      if (!address || address.length < 32 || address.length > 44) {
        return false;
      }
      if (address.startsWith('0x')) {
        return false;
      }
      if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) {
        return false;
      }
      const pubkey = new web3.PublicKey(address);
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
    if (!this.isValidAddress(address)) {
      throw new InvalidAddressError(this.chain, address);
    }

    const connection = this.ensureConnection();
    const owner = new web3.PublicKey(address);
    const transactions: RawTransaction[] = [];

    try {
      const limit = options?.limit ?? DEFAULT_SIGNATURE_LIMIT;
      const signatures = await connection.getSignaturesForAddress(owner, {
        limit,
      });

      for (const signatureInfo of signatures) {
        // Add rate limiting between requests
        if (this.config?.rateLimitMs && this.config.rateLimitMs > 0) {
          await sleep(this.config.rateLimitMs);
        }

        try {
          const parsedTx = await connection.getParsedTransaction(signatureInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!parsedTx) {
            continue;
          }

          const swapAttributes = await this.fetchJupiterSwap(signatureInfo.signature, parsedTx);
          const programIds = this.collectProgramIds(parsedTx);

          const rawTx: RawTransaction = {
            hash: signatureInfo.signature,
            timestamp:
              (parsedTx.blockTime ?? signatureInfo.blockTime ?? Math.floor(Date.now() / 1000)) *
              1000,
            from: address,
            status: parsedTx.meta?.err ? 'failed' : 'success',
            rawData: {
              slot: parsedTx.slot,
              meta: parsedTx.meta,
              transaction: parsedTx.transaction,
              programIds,
              swapAttributes,
            },
          };

          if (parsedTx.meta?.fee !== undefined) {
            rawTx.fee = parsedTx.meta.fee.toString();
          }

          if (parsedTx.meta) {
            const lamportDelta = this.computeLamportDelta(parsedTx, address);
            if (lamportDelta !== null) {
              rawTx.value = lamportDelta.toString();
            }
          }

          const destination = this.deriveDestination(parsedTx, address);
          if (destination) {
            rawTx.to = destination;
          }

          transactions.push(rawTx);
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          // eslint-disable-next-line no-console
          console.warn(`Failed to parse transaction ${signatureInfo.signature}:`, message);
        }
      }

      return transactions;
    } catch (error: unknown) {
      if (error instanceof BlockchainError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('429') || message.includes('Too Many Requests')) {
        throw new RateLimitError(this.chain);
      }
      throw new NetworkError(this.chain, message || 'Failed to fetch transactions', error);
    }
  }

  async parseTransaction(rawTx: RawTransaction): Promise<ParsedTransaction> {
    // Convert lamports to SOL (1 SOL = 1e9 lamports)
    const lamports = rawTx.value ? BigInt(rawTx.value) : 0n;
    const solAmount = Number(lamports) / 1e9;

    const parsed: ParsedTransaction = {
      hash: rawTx.hash,
      chain: this.chain,
      type: TransactionType.TRANSFER,
      from: rawTx.from,
      tokenSymbol: 'SOL',
      amount: solAmount.toString(),
      timestamp: new Date(rawTx.timestamp),
      status: rawTx.status,
      metadata: rawTx.rawData ?? {},
    };

    if (rawTx.fee) {
      parsed.feeAmount = rawTx.fee;
    }

    if (rawTx.to) {
      parsed.to = rawTx.to;
    }

    const meta = rawTx.rawData?.meta as web3.ConfirmedTransactionMeta | undefined;
    const swapAttributes = rawTx.rawData?.swapAttributes as SwapAttributes[] | undefined;

    if (swapAttributes && swapAttributes.length > 0) {
      const primary = swapAttributes[0];
      if (!primary) {
        return parsed;
      }
      parsed.type = TransactionType.SWAP;
      parsed.tokenSymbol = primary.outSymbol || primary.inSymbol || 'SWAP';
      parsed.amount =
        primary.outAmount?.toString?.() ?? primary.exactOutAmount?.toString?.() ?? parsed.amount;
      parsed.tokenAddress = primary.outMint || primary.inMint;
      parsed.metadata = {
        ...parsed.metadata,
        jupiter: swapAttributes.map(attr => ({
          inSymbol: attr.inSymbol,
          outSymbol: attr.outSymbol,
          inAmount: attr.inAmount?.toString?.(),
          outAmount: attr.outAmount?.toString?.(),
          legCount: attr.legCount,
          volumeInUSD: attr.volumeInUSD,
        })),
      };
      return parsed;
    }

    if (this.containsRaydiumProgram(rawTx.rawData?.programIds)) {
      parsed.type = TransactionType.SWAP;
      parsed.metadata = {
        ...parsed.metadata,
        raydium: {
          note: 'Detected Raydium program interaction',
          programIds: rawTx.rawData?.programIds,
        },
      };
    }

    if (meta) {
      const tokenChange = this.computeSplTokenDelta(meta, rawTx.from);
      if (tokenChange) {
        parsed.tokenSymbol = tokenChange.symbol;
        parsed.tokenAddress = tokenChange.mint;
        parsed.amount = tokenChange.amount;
        parsed.to = tokenChange.counterparty ?? parsed.to;
        parsed.metadata = {
          ...parsed.metadata,
          tokenChange,
        };
      }
    }

    // Fetch historical price for the transaction timestamp
    try {
      const priceData = await priceService.getHistoricalPrice(
        parsed.tokenSymbol,
        rawTx.timestamp,
        this.chain
      );

      if (priceData) {
        parsed.priceUSD = priceData.price;
        parsed.metadata = {
          ...parsed.metadata,
          priceData: {
            price: priceData.price,
            timestamp: priceData.timestamp,
            source: priceData.source,
          },
        };
      }
    } catch (error) {
      // Price fetching is not critical - log and continue
      console.warn(`Failed to fetch price for ${parsed.tokenSymbol} at ${rawTx.timestamp}:`, error);
    }

    return parsed;
  }

  async getBalance(address: string, tokenAddress?: string): Promise<WalletBalance[]> {
    if (!this.isValidAddress(address)) {
      throw new InvalidAddressError(this.chain, address);
    }

    const connection = this.ensureConnection();
    const owner = new web3.PublicKey(address);

    if (!tokenAddress) {
      const balance = await connection.getBalance(owner);
      return [
        {
          address,
          chain: this.chain,
          tokenSymbol: 'SOL',
          balance: balance.toString(),
          decimals: 9,
        },
      ];
    }

    try {
      const mint = new web3.PublicKey(tokenAddress);
      const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
      let total = 0n;
      let decimals = 0;

      for (const account of accounts.value) {
        const data = account.account.data as web3.ParsedAccountData;
        const tokenAmount = data?.parsed?.info?.tokenAmount as
          | { amount: string; decimals: number; symbol?: string }
          | undefined;

        if (!tokenAmount) {
          continue;
        }

        total += BigInt(tokenAmount.amount ?? '0');
        decimals = tokenAmount.decimals ?? decimals;
      }

      // Try to resolve token symbol from known tokens
      let tokenSymbol = 'SPL';
      if (tokenAddress === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
        tokenSymbol = 'USDC';
      } else if (tokenAddress === 'So11111111111111111111111111111111111111112') {
        tokenSymbol = 'SOL';
      }
      // TODO: Add more token symbol mappings or fetch from metadata

      return [
        {
          address,
          chain: this.chain,
          tokenSymbol,
          tokenAddress,
          balance: total.toString(),
          decimals,
        },
      ];
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NetworkError(this.chain, message ?? 'Failed to fetch SPL balance', error);
    }
  }

  async getTransactionByHash(hash: string): Promise<RawTransaction | null> {
    const connection = this.ensureConnection();

    try {
      const parsedTx = await connection.getParsedTransaction(hash, {
        maxSupportedTransactionVersion: 0,
      });
      if (!parsedTx) {
        return null;
      }

      const swapAttributes = await this.fetchJupiterSwap(hash, parsedTx);

      const rawTx: RawTransaction = {
        hash,
        timestamp: (parsedTx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000,
        from: parsedTx.transaction.message.accountKeys[0]?.pubkey?.toString?.() ?? '',
        status: parsedTx.meta?.err ? 'failed' : 'success',
        rawData: {
          slot: parsedTx.slot,
          meta: parsedTx.meta,
          transaction: parsedTx.transaction,
          swapAttributes,
          programIds: this.collectProgramIds(parsedTx),
        },
      };

      if (parsedTx.meta?.fee !== undefined) {
        rawTx.fee = parsedTx.meta.fee.toString();
      }

      const destination = this.deriveDestination(parsedTx, rawTx.from);
      if (destination) {
        rawTx.to = destination;
      }

      const lamportDelta = this.computeLamportDelta(parsedTx, rawTx.from);
      if (lamportDelta !== null) {
        rawTx.value = lamportDelta.toString();
      }

      return rawTx;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NetworkError(this.chain, message, error);
    }
  }

  async getCurrentBlockNumber(): Promise<number> {
    const connection = this.ensureConnection();

    try {
      return await connection.getSlot();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new NetworkError(this.chain, message, error);
    }
  }

  private async fetchJupiterSwap(signature: string, tx: web3.ParsedTransactionWithMeta) {
    try {
      const connection = this.ensureConnection();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await extractJupiter(
        signature,
        connection as any,
        tx as any,
        tx.blockTime ?? undefined
      );
    } catch (error) {
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('Jupiter parse error', (error as Error).message);
      }
      return undefined;
    }
  }

  private collectProgramIds(tx: web3.ParsedTransactionWithMeta): string[] {
    const keys = tx.transaction.message.accountKeys || [];
    return keys
      .map(entry =>
        entry?.pubkey ? entry.pubkey.toString() : entry.toString ? entry.toString() : ''
      )
      .filter(Boolean);
  }

  private containsRaydiumProgram(programIds?: string[]): boolean {
    if (!programIds) {
      return false;
    }
    return programIds.some(id => RAYDIUM_PROGRAM_IDS.has(id));
  }

  private computeLamportDelta(
    tx: web3.ParsedTransactionWithMeta,
    ownerAddress: string
  ): bigint | null {
    const meta = tx.meta;
    if (!meta) {
      return null;
    }

    const accountKeys = tx.transaction.message.accountKeys;
    const ownerIndex = accountKeys.findIndex(
      account => account?.pubkey?.toString?.() === ownerAddress
    );
    if (ownerIndex === -1) {
      return null;
    }

    const pre = meta.preBalances?.[ownerIndex];
    const post = meta.postBalances?.[ownerIndex];
    if (pre === undefined || post === undefined) {
      return null;
    }

    // Return signed difference: positive for incoming SOL, negative for outgoing
    const diff = BigInt(post) - BigInt(pre);
    return diff;
  }

  private computeSplTokenDelta(meta: web3.ConfirmedTransactionMeta, ownerAddress: string) {
    const pre = meta.preTokenBalances ?? [];
    const post = meta.postTokenBalances ?? [];

    for (const postBalance of post) {
      if (postBalance.owner !== ownerAddress) {
        continue;
      }
      const matchingPre = pre.find(
        preBalance => preBalance.owner === ownerAddress && preBalance.mint === postBalance.mint
      );
      const preAmount = BigInt(matchingPre?.uiTokenAmount?.amount ?? '0');
      const postAmount = BigInt(postBalance.uiTokenAmount?.amount ?? '0');
      const delta = postAmount - preAmount;

      if (delta !== 0n) {
        const absDelta = delta < 0n ? -delta : delta;
        return {
          mint: postBalance.mint,
          amount: absDelta.toString(),
          symbol: 'SPL',
          decimals: postBalance.uiTokenAmount?.decimals ?? 0,
          counterparty: matchingPre?.owner ?? ownerAddress,
          direction: delta < 0n ? 'out' : 'in',
        };
      }
    }

    return null;
  }

  private deriveDestination(
    tx: web3.ParsedTransactionWithMeta,
    ownerAddress: string
  ): string | undefined {
    const keys = tx.transaction.message.accountKeys || [];
    for (const key of keys) {
      const candidate = key?.pubkey?.toString?.() ?? key.toString?.();
      if (candidate && candidate !== ownerAddress) {
        return candidate;
      }
    }
    return undefined;
  }
}
