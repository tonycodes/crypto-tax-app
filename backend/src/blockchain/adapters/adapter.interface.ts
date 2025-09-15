// Transaction types as defined in shared types
export enum TransactionType {
  TRANSFER = 'transfer',
  SWAP = 'swap',
  STAKE = 'stake',
  UNSTAKE = 'unstake',
  MINT = 'mint',
  BURN = 'burn',
  DEPOSIT = 'deposit',
  WITHDRAW = 'withdraw',
  CLAIM = 'claim',
  UNKNOWN = 'unknown',
}

// Chain types
export enum ChainType {
  ETHEREUM = 'ethereum',
  SOLANA = 'solana',
  BITCOIN = 'bitcoin',
  SUI = 'sui',
}

// Raw transaction from blockchain
export interface RawTransaction {
  hash: string;
  blockNumber?: number;
  timestamp: number;
  from: string;
  to?: string;
  value?: string;
  fee?: string;
  status: 'success' | 'failed' | 'pending';
  rawData: any; // Chain-specific raw data
}

// Parsed transaction ready for database
export interface ParsedTransaction {
  hash: string;
  chain: ChainType;
  type: TransactionType;
  from: string;
  to?: string;
  tokenSymbol: string;
  tokenAddress?: string;
  amount: string; // String for precision
  priceUSD?: number;
  feeAmount?: string;
  feeUSD?: number;
  blockNumber?: number;
  timestamp: Date;
  status: 'success' | 'failed' | 'pending';
  metadata: Record<string, any>;
}

// Wallet balance information
export interface WalletBalance {
  address: string;
  chain: ChainType;
  tokenSymbol: string;
  tokenAddress?: string;
  balance: string; // String for precision
  decimals: number;
  priceUSD?: number;
  valueUSD?: number;
}

// Configuration for blockchain adapters
export interface BlockchainConfig {
  rpcUrl: string;
  apiKey?: string;
  network?: 'mainnet' | 'testnet' | 'devnet';
  rateLimitMs?: number;
}

// Main blockchain adapter interface
export interface IBlockchainAdapter {
  readonly chain: ChainType;

  // Initialize the adapter with configuration
  initialize(config: BlockchainConfig): Promise<void>;

  // Validate if an address is valid for this chain
  isValidAddress(address: string): boolean;

  // Get transactions for a wallet address
  getTransactions(
    address: string,
    options?: {
      fromBlock?: number;
      toBlock?: number;
      fromDate?: Date;
      toDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<RawTransaction[]>;

  // Parse raw transaction into standardized format
  parseTransaction(rawTx: RawTransaction): Promise<ParsedTransaction>;

  // Get current balance for a wallet
  getBalance(address: string, tokenAddress?: string): Promise<WalletBalance[]>;

  // Get transaction details by hash
  getTransactionByHash(hash: string): Promise<RawTransaction | null>;

  // Get current block number
  getCurrentBlockNumber(): Promise<number>;

  // Subscribe to new transactions (optional, for real-time updates)
  subscribeToAddress?(
    address: string,
    callback: (tx: RawTransaction) => void
  ): () => void;

  // Get historical price for a token at a specific time
  getHistoricalPrice?(
    tokenAddress: string,
    timestamp: Date
  ): Promise<number | null>;
}

// Factory for creating blockchain adapters
export interface IBlockchainAdapterFactory {
  createAdapter(chain: ChainType): IBlockchainAdapter;
}

// Error types for blockchain operations
export class BlockchainError extends Error {
  constructor(
    message: string,
    public chain: ChainType,
    public code?: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'BlockchainError';
  }
}

export class RateLimitError extends BlockchainError {
  constructor(chain: ChainType, retryAfter?: number) {
    super(
      `Rate limit exceeded for ${chain}${retryAfter ? `, retry after ${retryAfter}ms` : ''}`,
      chain,
      'RATE_LIMIT'
    );
    this.name = 'RateLimitError';
  }
}

export class InvalidAddressError extends BlockchainError {
  constructor(chain: ChainType, address: string) {
    super(
      `Invalid ${chain} address: ${address}`,
      chain,
      'INVALID_ADDRESS'
    );
    this.name = 'InvalidAddressError';
  }
}

export class NetworkError extends BlockchainError {
  constructor(chain: ChainType, message: string, originalError?: any) {
    super(
      `Network error on ${chain}: ${message}`,
      chain,
      'NETWORK_ERROR',
      originalError
    );
    this.name = 'NetworkError';
  }
}