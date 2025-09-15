import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EthereumAdapter } from './ethereum.adapter';
import { ChainType, TransactionType, BlockchainConfig } from './adapter.interface';
import { ethers } from 'ethers';

// Mock ethers
jest.mock('ethers');

describe('EthereumAdapter', () => {
  let adapter: EthereumAdapter;
  let mockProvider: jest.Mocked<ethers.JsonRpcProvider>;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new EthereumAdapter();
    mockProvider = {
      getBlockNumber: jest.fn(),
      getTransaction: jest.fn(),
      getTransactionReceipt: jest.fn(),
      getBalance: jest.fn(),
      getBlock: jest.fn(),
      getLogs: jest.fn(),
    } as any;

    (ethers.JsonRpcProvider as jest.MockedClass<typeof ethers.JsonRpcProvider>).mockImplementation(
      () => mockProvider
    );
  });

  describe('initialization', () => {
    it('should initialize with valid config', async () => {
      const config: BlockchainConfig = {
        rpcUrl: 'https://eth-mainnet.example.com',
        apiKey: 'test-api-key',
        network: 'mainnet',
      };

      await adapter.initialize(config);

      expect(ethers.JsonRpcProvider).toHaveBeenCalledWith(config.rpcUrl);
    });

    it('should throw error if already initialized', async () => {
      const config: BlockchainConfig = {
        rpcUrl: 'https://eth-mainnet.example.com',
      };

      await adapter.initialize(config);

      await expect(adapter.initialize(config)).rejects.toThrow('Adapter already initialized');
    });
  });

  describe('address validation', () => {
    it('should validate correct Ethereum addresses', () => {
      const validAddresses = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        '0x0000000000000000000000000000000000000000',
        '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
      ];

      validAddresses.forEach(address => {
        expect(adapter.isValidAddress(address)).toBe(true);
      });
    });

    it('should reject invalid Ethereum addresses', () => {
      const invalidAddresses = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', // Too short
        '742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', // Missing 0x
        '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG', // Invalid characters
        'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', // Bitcoin address
        '',
      ];

      invalidAddresses.forEach(address => {
        expect(adapter.isValidAddress(address)).toBe(false);
      });
    });
  });

  describe('getTransactions', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://eth-mainnet.example.com' });
    });

    it('should fetch transactions for an address', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      const mockLogs = [
        {
          transactionHash: '0x123',
          blockNumber: 18000000,
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          topics: [
            ethers.id('Transfer(address,address,uint256)'),
            ethers.zeroPadValue(address, 32),
            ethers.zeroPadValue('0xRecipient', 32),
          ],
          data: '0x0000000000000000000000000000000000000000000000000000000005f5e100',
        },
      ];

      const mockBlock = {
        timestamp: Math.floor(Date.now() / 1000),
      };

      const mockTx = {
        hash: '0x123',
        from: address,
        to: '0xRecipient',
        value: BigInt('1000000000000000000'), // 1 ETH
        gasPrice: BigInt('20000000000'), // 20 gwei
        blockNumber: 18000000,
      };

      const mockReceipt = {
        status: 1,
        gasUsed: BigInt(21000),
        logs: [],
      };

      // Mock getLogs to be called twice (sender and receiver)
      mockProvider.getLogs
        .mockResolvedValueOnce(mockLogs as any) // Sender logs
        .mockResolvedValueOnce([] as any); // Receiver logs (empty for this test)
      mockProvider.getBlock.mockResolvedValue(mockBlock as any);
      mockProvider.getTransaction.mockResolvedValue(mockTx as any);
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt as any);
      mockProvider.getBlockNumber.mockResolvedValue(18001000);

      const transactions = await adapter.getTransactions(address, {
        fromBlock: 17999000,
        toBlock: 18001000,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        hash: '0x123',
        from: address.toLowerCase(),
        status: 'success',
      });
    });

    it('should handle rate limiting with retry', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';

      // Mock getBlockNumber for the default 'latest' case
      mockProvider.getBlockNumber.mockResolvedValue(999);

      mockProvider.getLogs
        .mockRejectedValueOnce(new Error('rate limit exceeded')) // First attempt fails
        .mockResolvedValueOnce([] as any) // Retry for sender logs succeeds
        .mockResolvedValueOnce([] as any); // Receiver logs succeeds

      // Use a block range that fits in one chunk (0-999 is exactly 1000 blocks)
      const transactions = await adapter.getTransactions(address, {
        fromBlock: 0,
        toBlock: 999,
      });

      expect(transactions).toEqual([]);
      expect(mockProvider.getLogs).toHaveBeenCalledTimes(3); // Once for rate limit, twice for retry (sender + receiver)
    });
  });

  describe('parseTransaction', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://eth-mainnet.example.com' });
    });

    it('should parse ETH transfer transaction', async () => {
      const rawTx = {
        hash: '0x123',
        blockNumber: 18000000,
        timestamp: Date.now(),
        from: '0xSender',
        to: '0xRecipient',
        value: '1000000000000000000', // 1 ETH
        fee: '420000000000000', // 0.00042 ETH
        status: 'success' as const,
        rawData: {},
      };

      const parsed = await adapter.parseTransaction(rawTx);

      expect(parsed).toMatchObject({
        hash: '0x123',
        chain: ChainType.ETHEREUM,
        type: TransactionType.TRANSFER,
        tokenSymbol: 'ETH',
        amount: '1000000000000000000',
        feeAmount: '420000000000000',
      });
    });

    it('should parse ERC20 token transfer', async () => {
      const rawTx = {
        hash: '0x456',
        blockNumber: 18000000,
        timestamp: Date.now(),
        from: '0xSender',
        to: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT contract
        value: '0',
        fee: '420000000000000',
        status: 'success' as const,
        rawData: {
          logs: [
            {
              topics: [
                ethers.id('Transfer(address,address,uint256)'),
                ethers.zeroPadValue('0xSender', 32),
                ethers.zeroPadValue('0xRecipient', 32),
              ],
              data: '0x00000000000000000000000000000000000000000000000000000000000f4240', // 1 USDT (1000000 in hex)
            },
          ],
        },
      };

      const parsed = await adapter.parseTransaction(rawTx);

      expect(parsed).toMatchObject({
        hash: '0x456',
        chain: ChainType.ETHEREUM,
        type: TransactionType.TRANSFER,
        tokenSymbol: 'ERC20',
        tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        amount: '1000000',
      });
    });
  });

  describe('getBalance', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://eth-mainnet.example.com' });
    });

    it('should get ETH balance for address', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      mockProvider.getBalance.mockResolvedValue(BigInt('10500000000000000000')); // 10.5 ETH in wei

      const balances = await adapter.getBalance(address);

      expect(balances).toHaveLength(1);
      expect(balances[0]).toMatchObject({
        address,
        chain: ChainType.ETHEREUM,
        tokenSymbol: 'ETH',
        balance: '10500000000000000000', // 10.5 ETH in wei
        decimals: 18,
      });
    });

    it('should get ERC20 token balance', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      const tokenAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT

      // Mock the Contract constructor and its methods
      const mockContract = {
        balanceOf: jest.fn(() => Promise.resolve(BigInt('1000000'))), // 1 USDT (6 decimals)
        decimals: jest.fn(() => Promise.resolve(6)),
        symbol: jest.fn(() => Promise.resolve('USDT')),
      };

      // Override ethers.Contract to return our mock
      jest.spyOn(ethers, 'Contract').mockImplementation(() => mockContract as any);

      const balances = await adapter.getBalance(address, tokenAddress);

      expect(balances).toHaveLength(1);
      expect(balances[0]).toMatchObject({
        address,
        chain: ChainType.ETHEREUM,
        tokenSymbol: 'USDT',
        tokenAddress,
        balance: '1000000',
        decimals: 6,
      });
    });
  });

  describe('getCurrentBlockNumber', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://eth-mainnet.example.com' });
    });

    it('should return current block number', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(18500000);

      const blockNumber = await adapter.getCurrentBlockNumber();

      expect(blockNumber).toBe(18500000);
    });
  });

  describe('getTransactionByHash', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://eth-mainnet.example.com' });
    });

    it('should fetch transaction by hash', async () => {
      const hash = '0x123abc';
      const mockTx = {
        hash,
        from: '0xSender',
        to: '0xRecipient',
        value: BigInt('1000000000000000000'), // 1 ETH
        gasPrice: BigInt('20000000000'), // 20 gwei
        blockNumber: 18000000,
      };
      const mockReceipt = {
        status: 1,
        gasUsed: BigInt(21000),
        logs: [],
      };
      const mockBlock = {
        timestamp: Math.floor(Date.now() / 1000),
      };

      mockProvider.getTransaction.mockResolvedValue(mockTx as any);
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt as any);
      mockProvider.getBlock.mockResolvedValue(mockBlock as any);

      const transaction = await adapter.getTransactionByHash(hash);

      expect(transaction).toMatchObject({
        hash,
        from: '0xSender'.toLowerCase(),
        to: '0xRecipient'.toLowerCase(),
        status: 'success',
      });
    });

    it('should return null for non-existent transaction', async () => {
      mockProvider.getTransaction.mockResolvedValue(null);

      const transaction = await adapter.getTransactionByHash('0xnonexistent');

      expect(transaction).toBeNull();
    });
  });
});
