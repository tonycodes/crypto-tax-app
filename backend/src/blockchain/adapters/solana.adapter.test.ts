/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SolanaAdapter } from './solana.adapter';
import { ChainType, TransactionType, BlockchainConfig, RawTransaction } from './adapter.interface';

jest.mock('@jup-ag/instruction-parser', () => ({
  extract: jest.fn(() => Promise.resolve(undefined)),
}));

// Mock Solana web3 before importing it
jest.mock('@solana/web3.js', () => {
  const mockPublicKey = jest.fn() as any;
  mockPublicKey.mockImplementation((key: any) => {
    const keyStr = String(key);
    if (!keyStr || keyStr.length < 32 || keyStr.length > 44) {
      throw new Error('Invalid public key');
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(keyStr)) {
      throw new Error('Invalid public key');
    }

    return {
      toString: () => keyStr,
      toBuffer: () => Buffer.from(keyStr, 'utf8'),
      equals: (other: any) => keyStr === other.toString(),
    };
  });

  mockPublicKey.isOnCurve = jest.fn().mockImplementation((buffer: any) => {
    const str = buffer.toString('utf8');
    const isValidLength = str.length >= 32 && str.length <= 44;
    const isValidBase58 = /^[1-9A-HJ-NP-Za-km-z]+$/.test(str);
    const isSystemProgram = str === '11111111111111111111111111111111';
    const notAllSameChar = isSystemProgram || !/^(.)\1+$/.test(str);

    return isValidLength && isValidBase58 && notAllSameChar;
  });

  return {
    Connection: jest.fn(),
    PublicKey: mockPublicKey,
  };
});

import * as web3 from '@solana/web3.js';
import { extract as mockExtract } from '@jup-ag/instruction-parser';
const extractMock = mockExtract as unknown as jest.MockedFunction<typeof mockExtract>;

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
      getParsedTokenAccountsByOwner: jest.fn(),
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
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv',
      ];

      validAddresses.forEach(address => {
        expect(adapter.isValidAddress(address)).toBe(true);
      });
    });

    it('should reject invalid Solana addresses', () => {
      const invalidAddresses = [
        '111111111111111111111111111111',
        'So1111111111111111111111111111111111111111112',
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
        '',
      ];

      invalidAddresses.forEach(address => {
        expect(adapter.isValidAddress(address)).toBe(false);
      });
    });
  });

  describe('getTransactions', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.mainnet-beta.solana.com' });
      extractMock.mockImplementation(() => Promise.resolve(undefined));
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
          preTokenBalances: [],
          postTokenBalances: [],
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
        value: '5000',
      });
    });

    it('should include Jupiter swap metadata when available', async () => {
      const address = '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv';
      const mockSignatures = [
        {
          signature: 'mockSignature2',
          slot: 100001,
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
          preTokenBalances: [],
          postTokenBalances: [],
        },
        transaction: {
          message: {
            accountKeys: [
              { pubkey: new web3.PublicKey(address) },
              { pubkey: new web3.PublicKey('11111111111111111111111111111111') },
              { pubkey: new web3.PublicKey('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4') },
            ],
          },
        },
      };

      extractMock.mockImplementationOnce(() =>
        Promise.resolve([
          {
            inSymbol: 'SOL',
            outSymbol: 'USDC',
            inAmount: BigInt(1000),
            outAmount: BigInt(990),
            inMint: 'So11111111111111111111111111111111111111112',
            outMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            legCount: 1,
            volumeInUSD: 20,
            inAmountInUSD: 20,
            outAmountInUSD: 19,
            exactInAmount: BigInt(1000),
            exactOutAmount: BigInt(990),
            exactInAmountInUSD: 20,
            exactOutAmountInUSD: 19,
            owner: address,
            transferAuthority: address,
            programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
            signature: 'mockSignature2',
            timestamp: new Date(),
            instruction: 'route',
            lastAccount: '',
            swapData: {} as any,
          },
        ])
      );

      mockConnection.getSignaturesForAddress.mockResolvedValue(mockSignatures as any);
      mockConnection.getParsedTransaction.mockResolvedValue(mockTransaction as any);

      const transactions = await adapter.getTransactions(address, {
        limit: 1,
      });

      const transaction = transactions[0];
      expect(transaction?.rawData?.swapAttributes).toBeDefined();
      if (!transaction) {
        throw new Error('Expected transaction to be defined');
      }
      const parsed = await adapter.parseTransaction(transaction);
      expect(parsed.type).toBe(TransactionType.SWAP);
      expect(parsed.tokenSymbol).toBe('USDC');
    });
  });

  describe('parseTransaction', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.mainnet-beta.solana.com' });
      extractMock.mockImplementation(() => Promise.resolve(undefined));
    });

    it('should parse basic SOL transfer', async () => {
      const rawTx: RawTransaction = {
        hash: 'signature123',
        timestamp: Date.now(),
        from: '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv',
        value: '5000',
        status: 'success',
        rawData: {
          meta: {
            preBalances: [1000000, 1000000],
            postBalances: [999500, 1000500],
            preTokenBalances: [],
            postTokenBalances: [],
          },
          transaction: {
            message: {
              accountKeys: [
                { pubkey: new web3.PublicKey('8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv') },
                { pubkey: new web3.PublicKey('11111111111111111111111111111111') },
              ],
            },
          },
        },
      };

      const parsed = await adapter.parseTransaction(rawTx);

      expect(parsed).toMatchObject({
        tokenSymbol: 'SOL',
        amount: '5000',
        type: TransactionType.TRANSFER,
      });
    });
  });

  describe('getBalance', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.mainnet-beta.solana.com' });
    });

    it('should get SOL balance for address', async () => {
      const address = '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv';
      mockConnection.getBalance.mockResolvedValue(5000000000);

      const balances = await adapter.getBalance(address);

      expect(balances).toEqual([
        {
          address,
          chain: ChainType.SOLANA,
          tokenSymbol: 'SOL',
          balance: '5000000000',
          decimals: 9,
        },
      ]);
    });

    it('should get SPL token balance', async () => {
      const address = '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv';
      const tokenAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

      mockConnection.getParsedTokenAccountsByOwner.mockResolvedValue({
        value: [
          {
            account: {
              data: {
                parsed: {
                  info: {
                    tokenAmount: {
                      amount: '1000000',
                      decimals: 6,
                      symbol: 'USDC',
                    },
                  },
                },
              },
            },
          },
        ],
      } as any);

      const balances = await adapter.getBalance(address, tokenAddress);

      expect(balances).toEqual([
        {
          address,
          chain: ChainType.SOLANA,
          tokenSymbol: 'USDC',
          tokenAddress,
          balance: '1000000',
          decimals: 6,
        },
      ]);
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
      extractMock.mockImplementation(() => Promise.resolve(undefined));
    });

    it('should fetch transaction by signature', async () => {
      const signature = 'mockSignature123';
      const mockTransaction = {
        blockTime: Math.floor(Date.now() / 1000),
        slot: 123,
        meta: {
          fee: 5000,
          err: null,
          postBalances: [1000000000, 2000000000],
          preBalances: [1000005000, 2000000000],
          preTokenBalances: [],
          postTokenBalances: [],
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
        value: '5000',
      });
    });

    it('should return null for non-existent transaction', async () => {
      mockConnection.getParsedTransaction.mockResolvedValue(null);

      const transaction = await adapter.getTransactionByHash('nonexistent');

      expect(transaction).toBeNull();
    });
  });
});
