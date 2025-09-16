/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EthereumAdapter } from './ethereum.adapter';
import { ChainType, TransactionType } from './adapter.interface';
import { ethers } from 'ethers';

describe('EthereumAdapter', () => {
  let adapter: EthereumAdapter;
  let mockProvider: {
    getBlockNumber: jest.Mock;
    getTransaction: jest.Mock;
    getTransactionReceipt: jest.Mock;
    getBalance: jest.Mock;
    getBlock: jest.Mock;
    getLogs: jest.Mock;
  };
  let mockContract: any;
  let contractSpy: jest.SpyInstance;

  const attachMockProvider = () => {
    mockProvider = {
      getBlockNumber: jest.fn(),
      getTransaction: jest.fn(),
      getTransactionReceipt: jest.fn(),
      getBalance: jest.fn(),
      getBlock: jest.fn(),
      getLogs: jest.fn(),
    };

    (adapter as any).provider = mockProvider;
    (adapter as any).initialized = true;
  };

  beforeEach(() => {
    adapter = new EthereumAdapter();
    mockContract = {
      balanceOf: jest.fn(),
      decimals: jest.fn(),
      symbol: jest.fn(),
    };
    contractSpy = jest.spyOn(ethers as any, 'Contract').mockImplementation(() => mockContract);
  });

  afterEach(() => {
    contractSpy.mockRestore();
  });

  describe('initialization', () => {
    it('should initialize with valid config', async () => {
      const config = { rpcUrl: 'https://eth-mainnet.example.com' };
      await adapter.initialize(config);
      expect((adapter as any).initialized).toBe(true);
    });

    it('should throw error if already initialized', async () => {
      const config = { rpcUrl: 'https://eth-mainnet.example.com' };
      await adapter.initialize(config);
      await expect(adapter.initialize(config)).rejects.toThrow('Adapter already initialized');
    });
  });

  describe('address validation', () => {
    it('should validate correct Ethereum addresses', () => {
      const validAddresses = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        '0x0000000000000000000000000000000000000000',
        '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      ];

      validAddresses.forEach(address => {
        expect(adapter.isValidAddress(address)).toBe(true);
      });
    });

    it('should reject invalid Ethereum addresses', () => {
      const invalidAddresses = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        '742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
        '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
        'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        '',
      ];

      invalidAddresses.forEach(address => {
        expect(adapter.isValidAddress(address)).toBe(false);
      });
    });
  });

  describe('getTransactions', () => {
    beforeEach(() => {
      attachMockProvider();
    });

    it('should fetch transactions for an address', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      const recipientAddress = '0x0000000000000000000000000000000000000002';
      const mockLogs = [
        {
          transactionHash: '0xabc',
          blockNumber: 18000000,
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          topics: [
            transferTopic,
            ethers.zeroPadValue(address.toLowerCase(), 32),
            ethers.zeroPadValue(recipientAddress.toLowerCase(), 32),
          ],
          data: ethers.zeroPadValue(ethers.toBeHex(10n ** 18n), 32),
        },
      ];

      const mockBlock = {
        timestamp: Math.floor(Date.now() / 1000),
      };

      const mockTx = {
        hash: '0xabc',
        from: address,
        to: recipientAddress,
        value: 10n ** 18n,
        gasPrice: 20n * 10n ** 9n,
        blockNumber: 18000000,
      };

      const mockReceipt = {
        status: 1,
        gasUsed: 21000n,
        logs: [],
        blockNumber: 18000000,
      };

      mockProvider.getBlockNumber.mockResolvedValue(18001000);
      mockProvider.getLogs
        .mockResolvedValueOnce(mockLogs as any)
        .mockResolvedValueOnce([] as any)
        .mockResolvedValue([] as any)
        .mockResolvedValue([] as any);
      mockProvider.getTransaction.mockResolvedValue(mockTx as any);
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt as any);
      mockProvider.getBlock.mockResolvedValue(mockBlock as any);

      mockContract.decimals.mockResolvedValue(6);
      mockContract.symbol.mockResolvedValue('USDT');

      const transactions = await adapter.getTransactions(address, {
        fromBlock: 17999000,
        toBlock: 18001000,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        hash: '0xabc',
        from: address.toLowerCase(),
        to: recipientAddress.toLowerCase(),
        status: 'success',
      });
      expect(transactions[0]?.rawData?.tokenMetadata).toHaveProperty(
        '0xdac17f958d2ee523a2206206994597c13d831ec7'
      );
    });

    it('should handle rate limiting with retry', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      mockProvider.getBlockNumber.mockResolvedValue(1999);

      mockProvider.getLogs
        .mockRejectedValueOnce(new Error('rate limit exceeded'))
        .mockResolvedValue([] as any)
        .mockResolvedValue([] as any);

      const transactions = await adapter.getTransactions(address, {
        fromBlock: 0,
        toBlock: 999,
      });

      expect(transactions).toEqual([]);
      expect(mockProvider.getLogs).toHaveBeenCalledTimes(3);
    });
  });

  describe('parseTransaction', () => {
    beforeEach(() => {
      attachMockProvider();
    });

    it('should parse ETH transfer transaction', async () => {
      const rawTx = {
        hash: '0x123',
        blockNumber: 18000000,
        timestamp: Date.now(),
        from: '0xSender',
        to: '0xRecipient',
        value: '1000000000000000000',
        fee: '420000000000000',
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
      });
    });

    it('should parse ERC20 token transfer', async () => {
      const transferTopic = ethers.id('Transfer(address,address,uint256)');
      const senderAddress = '0x0000000000000000000000000000000000000003';
      const recipientAddress = '0x0000000000000000000000000000000000000004';
      const valueHex = ethers.zeroPadValue(ethers.toBeHex(1_000_000n), 32);
      const rawTx = {
        hash: '0x456',
        blockNumber: 18000000,
        timestamp: Date.now(),
        from: '0xSender',
        to: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        value: '0',
        fee: '420000000000000',
        status: 'success' as const,
        rawData: {
          logs: [
            {
              address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
              topics: [
                transferTopic,
                ethers.zeroPadValue(senderAddress.toLowerCase(), 32),
                ethers.zeroPadValue(recipientAddress.toLowerCase(), 32),
              ],
              data: valueHex,
            },
          ],
          tokenMetadata: {
            '0xdac17f958d2ee523a2206206994597c13d831ec7': {
              symbol: 'USDT',
              decimals: 6,
            },
          },
        },
      };

      const parsed = await adapter.parseTransaction(rawTx);

      expect(parsed).toMatchObject({
        hash: '0x456',
        chain: ChainType.ETHEREUM,
        type: TransactionType.TRANSFER,
        tokenSymbol: 'USDT',
        tokenAddress: '0xdac17f958d2ee523a2206206994597c13d831ec7',
        amount: '1000000',
        from: senderAddress.toLowerCase(),
        to: recipientAddress.toLowerCase(),
      });
    });
  });

  describe('getBalance', () => {
    beforeEach(() => {
      attachMockProvider();
    });

    it('should get ETH balance for address', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      mockProvider.getBalance.mockResolvedValue(10n ** 18n);

      const balances = await adapter.getBalance(address);

      expect(balances).toHaveLength(1);
      expect(balances[0]).toMatchObject({
        address,
        chain: ChainType.ETHEREUM,
        tokenSymbol: 'ETH',
        balance: '1000000000000000000',
        decimals: 18,
      });
    });

    it('should get ERC20 token balance', async () => {
      const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1';
      const tokenAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

      mockContract.balanceOf.mockResolvedValue(1000000n);
      mockContract.decimals.mockResolvedValue(6);
      mockContract.symbol.mockResolvedValue('USDT');

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
    beforeEach(() => {
      attachMockProvider();
    });

    it('should return current block number', async () => {
      mockProvider.getBlockNumber.mockResolvedValue(18500000);

      const blockNumber = await adapter.getCurrentBlockNumber();

      expect(blockNumber).toBe(18500000);
    });
  });

  describe('getTransactionByHash', () => {
    beforeEach(() => {
      attachMockProvider();
    });

    it('should fetch transaction by hash', async () => {
      const hash = '0x123abc';
      const mockTx = {
        hash,
        from: '0xSender',
        to: '0xRecipient',
        value: 10n ** 18n,
        gasPrice: 20n * 10n ** 9n,
        blockNumber: 18000000,
      };
      const mockReceipt = {
        status: 1,
        gasUsed: 21000n,
        logs: [],
        blockNumber: 18000000,
      };
      const mockBlock = {
        timestamp: Math.floor(Date.now() / 1000),
      };

      mockProvider.getTransaction.mockResolvedValue(mockTx as any);
      mockProvider.getTransactionReceipt.mockResolvedValue(mockReceipt as any);
      mockProvider.getBlock.mockResolvedValue(mockBlock as any);

      const result = await adapter.getTransactionByHash(hash);

      expect(result).toMatchObject({
        hash,
        from: '0xsender',
        to: '0xrecipient',
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
