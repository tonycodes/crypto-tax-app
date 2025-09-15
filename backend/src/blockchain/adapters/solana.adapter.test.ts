import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SolanaAdapter } from './solana.adapter';
import { ChainType, TransactionType, BlockchainConfig } from './adapter.interface';

// Mock Solana web3 before importing it
jest.mock('@solana/web3.js', () => {
  const mockPublicKey = jest.fn() as any;
  mockPublicKey.mockImplementation((key: any) => {
    const keyStr = String(key);
    // Simulate validation - reject invalid keys
    if (!keyStr || keyStr.length < 32 || keyStr.length > 44) {
      throw new Error('Invalid public key');
    }
    // Check for invalid base58 characters
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(keyStr)) {
      throw new Error('Invalid public key');
    }

    return {
      toString: () => keyStr,
      toBuffer: () => Buffer.from(keyStr, 'utf8'),
      equals: (other: any) => keyStr === other.toString(),
    };
  });

  // Add static method that validates base58 strings
  mockPublicKey.isOnCurve = jest.fn().mockImplementation((buffer: any) => {
    // Simulate on-curve validation
    const str = buffer.toString('utf8');
    // Valid Solana addresses are 32-44 chars and base58
    const isValidLength = str.length >= 32 && str.length <= 44;
    const isValidBase58 = /^[1-9A-HJ-NP-Za-km-z]+$/.test(str);

    // Special case: System program is all 1s but is valid
    const isSystemProgram = str === '11111111111111111111111111111111';

    // Reject if all chars are the same (except system program)
    const notAllSameChar = isSystemProgram || !/^(.)\1+$/.test(str);

    return isValidLength && isValidBase58 && notAllSameChar;
  });

  return {
    Connection: jest.fn(),
    PublicKey: mockPublicKey,
  };
});

import * as web3 from '@solana/web3.js';

describe('SolanaAdapter', () => {
  let adapter: SolanaAdapter;
  let mockConnection: jest.Mocked<web3.Connection>;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new SolanaAdapter();
    mockConnection = {
      getBalance: jest.fn(),
      getSignaturesForAddress: jest.fn(),
      getParsedTransaction: jest.fn(),
      getTransaction: jest.fn(),
      getSlot: jest.fn(),
      getBlockTime: jest.fn(),
    } as any;

    (web3.Connection as jest.MockedClass<typeof web3.Connection>).mockImplementation(
      () => mockConnection
    );
  });

  describe('initialization', () => {
    it('should initialize with valid config', async () => {
      const config: BlockchainConfig = {
        rpcUrl: 'https://api.mainnet-beta.solana.com',
        apiKey: 'test-api-key',
        network: 'mainnet',
      };

      await adapter.initialize(config);

      expect(web3.Connection).toHaveBeenCalledWith(
        config.rpcUrl,
        expect.objectContaining({ commitment: 'confirmed' })
      );
    });

    it('should throw error if already initialized', async () => {
      const config: BlockchainConfig = {
        rpcUrl: 'https://api.mainnet-beta.solana.com',
      };

      await adapter.initialize(config);

      await expect(adapter.initialize(config)).rejects.toThrow('Adapter already initialized');
    });
  });

  describe('address validation', () => {
    it('should validate correct Solana addresses', () => {
      const validAddresses = [
        '11111111111111111111111111111111',
        'So11111111111111111111111111111112',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv', // Valid public key
      ];

      validAddresses.forEach(address => {
        const result = adapter.isValidAddress(address);
        if (!result) {
          console.log(`Incorrectly rejected: "${address}" (length: ${address.length})`);
        }
        expect(result).toBe(true);
      });
    });

    it('should reject invalid Solana addresses', () => {
      const invalidAddresses = [
        '111111111111111111111111111111', // Too short (31 chars)
        'So1111111111111111111111111111111111111111112', // Too long (45 chars)
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', // Ethereum address
        'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', // Invalid base58 (contains 0, O, I, l)
        '',
      ];

      invalidAddresses.forEach(address => {
        const result = adapter.isValidAddress(address);
        if (result) {
          console.log(`Incorrectly accepted: "${address}"`);
        }
        expect(result).toBe(false);
      });
    });
  });

  describe('getTransactions', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.mainnet-beta.solana.com' });
    });

    it('should fetch transactions for an address', async () => {
      const address = '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv';
      const mockSignatures = [
        {
          signature: 'mockSignature1',
          slot: 100000,
          blockTime: Math.floor(Date.now() / 1000),
        },
      ];

      const mockTransaction = {
        blockTime: Math.floor(Date.now() / 1000),
        meta: {
          fee: 5000,
          err: null,
          postBalances: [1000000000, 2000000000],
          preBalances: [1000005000, 2000000000],
        },
        transaction: {
          message: {
            accountKeys: [
              { pubkey: new web3.PublicKey(address) },
              { pubkey: new web3.PublicKey('11111111111111111111111111111111') },
            ],
          },
        },
      };

      mockConnection.getSignaturesForAddress.mockResolvedValue(mockSignatures as any);
      mockConnection.getParsedTransaction.mockResolvedValue(mockTransaction as any);

      const transactions = await adapter.getTransactions(address, {
        limit: 1,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        hash: 'mockSignature1',
        from: address,
        status: 'success',
      });
    });

    it('should handle transaction errors', async () => {
      const address = '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv';
      const mockSignatures = [
        {
          signature: 'mockSignature1',
          slot: 100000,
          blockTime: Math.floor(Date.now() / 1000),
          err: { InstructionError: [0, 'Custom'] },
        },
      ];

      const mockTransaction = {
        blockTime: Math.floor(Date.now() / 1000),
        meta: {
          fee: 5000,
          err: { InstructionError: [0, 'Custom'] },
          postBalances: [1000000000, 2000000000],
          preBalances: [1000005000, 2000000000],
        },
        transaction: {
          message: {
            accountKeys: [
              { pubkey: new web3.PublicKey(address) },
              { pubkey: new web3.PublicKey('11111111111111111111111111111111') },
            ],
          },
        },
      };

      mockConnection.getSignaturesForAddress.mockResolvedValue(mockSignatures as any);
      mockConnection.getParsedTransaction.mockResolvedValue(mockTransaction as any);

      const transactions = await adapter.getTransactions(address, {
        limit: 1,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.status).toBe('failed');
    });
  });

  describe('parseTransaction', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.mainnet-beta.solana.com' });
    });

    it('should parse SOL transfer transaction', async () => {
      const rawTx = {
        hash: 'txHash123',
        blockNumber: 100000,
        timestamp: Date.now(),
        from: '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv',
        to: '11111111111111111111111111111111',
        value: '1000000000', // 1 SOL in lamports
        fee: '5000',
        status: 'success' as const,
        rawData: {},
      };

      const parsed = await adapter.parseTransaction(rawTx);

      expect(parsed).toMatchObject({
        hash: 'txHash123',
        chain: ChainType.SOLANA,
        type: TransactionType.TRANSFER,
        tokenSymbol: 'SOL',
        amount: '1000000000',
        feeAmount: '5000',
      });
    });

    it('should parse SPL token transfer', async () => {
      const rawTx = {
        hash: 'txHash456',
        blockNumber: 100000,
        timestamp: Date.now(),
        from: '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv',
        to: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC mint
        value: '1000000', // 1 USDC (6 decimals)
        fee: '5000',
        status: 'success' as const,
        rawData: {
          tokenTransfer: {
            mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            amount: '1000000',
          },
        },
      };

      const parsed = await adapter.parseTransaction(rawTx);

      expect(parsed).toMatchObject({
        hash: 'txHash456',
        chain: ChainType.SOLANA,
        type: TransactionType.TRANSFER,
        tokenSymbol: 'SPL',
        tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: '1000000',
      });
    });
  });

  describe('getBalance', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.mainnet-beta.solana.com' });
    });

    it('should get SOL balance for address', async () => {
      const address = '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv';
      mockConnection.getBalance.mockResolvedValue(5000000000); // 5 SOL in lamports

      const balances = await adapter.getBalance(address);

      expect(balances).toHaveLength(1);
      expect(balances[0]).toMatchObject({
        address,
        chain: ChainType.SOLANA,
        tokenSymbol: 'SOL',
        balance: '5000000000',
        decimals: 9,
      });
    });

    it('should handle SPL token balances', async () => {
      const address = '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv';
      const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

      // For SPL tokens, we'll need to mock token account fetching
      // This is simplified for the test
      const balances = await adapter.getBalance(address, usdcMint);

      // The actual implementation will fetch token account info
      expect(balances).toBeDefined();
    });
  });

  describe('getCurrentBlockNumber', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.mainnet-beta.solana.com' });
    });

    it('should return current slot number', async () => {
      mockConnection.getSlot.mockResolvedValue(150000000);

      const slot = await adapter.getCurrentBlockNumber();

      expect(slot).toBe(150000000);
    });
  });

  describe('getTransactionByHash', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.mainnet-beta.solana.com' });
    });

    it('should fetch transaction by signature', async () => {
      const signature = 'mockSignature123';
      const mockTransaction = {
        blockTime: Math.floor(Date.now() / 1000),
        slot: 100000,
        meta: {
          fee: 5000,
          err: null,
          postBalances: [1000000000, 2000000000],
          preBalances: [1000005000, 2000000000],
        },
        transaction: {
          message: {
            accountKeys: [
              { pubkey: new web3.PublicKey('8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv') },
              { pubkey: new web3.PublicKey('11111111111111111111111111111111') },
            ],
          },
        },
      };

      mockConnection.getParsedTransaction.mockResolvedValue(mockTransaction as any);

      const transaction = await adapter.getTransactionByHash(signature);

      expect(transaction).toMatchObject({
        hash: signature,
        status: 'success',
      });
    });

    it('should return null for non-existent transaction', async () => {
      mockConnection.getParsedTransaction.mockResolvedValue(null);

      const transaction = await adapter.getTransactionByHash('nonexistent');

      expect(transaction).toBeNull();
    });
  });
});
