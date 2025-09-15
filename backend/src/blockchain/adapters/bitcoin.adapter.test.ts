import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BitcoinAdapter } from './bitcoin.adapter';
import { ChainType, TransactionType, BlockchainConfig } from './adapter.interface';
import axios from 'axios';

// Mock axios for API calls
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  })),
  get: jest.fn(),
  post: jest.fn(),
}));

// Mock bitcoinjs-lib
jest.mock('bitcoinjs-lib', () => ({
  address: {
    toOutputScript: jest.fn().mockImplementation((address: any) => {
      // Simple validation for Bitcoin addresses
      // P2PKH addresses start with '1' (26-35 chars)
      // P2SH addresses start with '3' (26-35 chars)
      // Bech32 addresses start with 'bc1' (42-62 chars)
      if (!address) throw new Error('Invalid address');

      if (address.startsWith('0x')) {
        throw new Error('Invalid address'); // Ethereum address
      }

      if (address.startsWith('1') || address.startsWith('3')) {
        // Most Bitcoin P2PKH/P2SH addresses are 34 characters
        if (address.length < 34 || address.length > 35) {
          throw new Error('Invalid address');
        }
        // Check for valid base58 characters (no 0, O, I, l)
        if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) {
          throw new Error('Invalid address');
        }
      } else if (address.startsWith('bc1')) {
        if (address.length < 42 || address.length > 62) {
          throw new Error('Invalid address');
        }
      } else {
        throw new Error('Invalid address');
      }

      return Buffer.from('mock_script');
    }),
  },
  networks: {
    bitcoin: {
      messagePrefix: '\x18Bitcoin Signed Message:\n',
      bech32: 'bc',
      bip32: {
        public: 0x0488b21e,
        private: 0x0488ade4,
      },
      pubKeyHash: 0x00,
      scriptHash: 0x05,
      wif: 0x80,
    },
    testnet: {
      messagePrefix: '\x18Bitcoin Signed Message:\n',
      bech32: 'tb',
      bip32: {
        public: 0x043587cf,
        private: 0x04358394,
      },
      pubKeyHash: 0x6f,
      scriptHash: 0xc4,
      wif: 0xef,
    },
  },
}));

describe('BitcoinAdapter', () => {
  let adapter: BitcoinAdapter;
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    // Make axios.create return our mock instance
    (axios.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    adapter = new BitcoinAdapter();
  });

  describe('initialization', () => {
    it('should initialize with valid config', async () => {
      const config: BlockchainConfig = {
        rpcUrl: 'https://api.blockcypher.com/v1/btc/main',
        apiKey: 'test-api-key',
        network: 'mainnet',
      };

      await adapter.initialize(config);

      // Bitcoin adapter uses external APIs, so just verify it initializes
      expect(adapter).toBeDefined();
    });

    it('should throw error if already initialized', async () => {
      const config: BlockchainConfig = {
        rpcUrl: 'https://api.blockcypher.com/v1/btc/main',
      };

      await adapter.initialize(config);

      await expect(adapter.initialize(config)).rejects.toThrow('Adapter already initialized');
    });
  });

  describe('address validation', () => {
    it('should validate correct Bitcoin addresses', () => {
      const validAddresses = [
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', // P2PKH (Legacy)
        '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', // P2SH (SegWit compatible)
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', // Bech32 (Native SegWit)
        'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3', // Bech32 long
      ];

      validAddresses.forEach(address => {
        expect(adapter.isValidAddress(address)).toBe(true);
      });
    });

    it('should reject invalid Bitcoin addresses', () => {
      const invalidAddresses = [
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1', // Ethereum address
        '8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv', // Solana address
        '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf', // Too short
        'invalid_address',
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
      await adapter.initialize({ rpcUrl: 'https://api.blockcypher.com/v1/btc/main' });
    });

    it('should fetch transactions for an address', async () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const mockApiResponse = {
        data: {
          txs: [
            {
              txid: 'mock_txid_123',
              blockheight: 800000,
              confirmations: 6,
              time: Math.floor(Date.now() / 1000),
              value_in: 0,
              value_out: 5000000000, // 50 BTC in satoshis
              fee: 10000,
              inputs: [],
              outputs: [
                {
                  addresses: [address],
                  value: 5000000000,
                },
              ],
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockApiResponse);

      const transactions = await adapter.getTransactions(address, {
        limit: 1,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        hash: 'mock_txid_123',
        from: address,
        status: 'success',
      });
    });

    it('should handle API errors', async () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      await expect(adapter.getTransactions(address)).rejects.toThrow();
    });
  });

  describe('parseTransaction', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.blockcypher.com/v1/btc/main' });
    });

    it('should parse Bitcoin transfer transaction', async () => {
      const rawTx = {
        hash: 'txHash123',
        blockNumber: 800000,
        timestamp: Date.now(),
        from: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        to: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
        value: '100000000', // 1 BTC in satoshis
        fee: '10000',
        status: 'success' as const,
        rawData: {},
      };

      const parsed = await adapter.parseTransaction(rawTx);

      expect(parsed).toMatchObject({
        hash: 'txHash123',
        chain: ChainType.BITCOIN,
        type: TransactionType.TRANSFER,
        tokenSymbol: 'BTC',
        amount: '100000000',
        feeAmount: '10000',
      });
    });
  });

  describe('getBalance', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.blockcypher.com/v1/btc/main' });
    });

    it('should get BTC balance for address', async () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
      const mockApiResponse = {
        data: {
          address,
          balance: 5000000000, // 50 BTC in satoshis
          unconfirmed_balance: 0,
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockApiResponse);

      const balances = await adapter.getBalance(address);

      expect(balances).toHaveLength(1);
      expect(balances[0]).toMatchObject({
        address,
        chain: ChainType.BITCOIN,
        tokenSymbol: 'BTC',
        balance: '5000000000',
        decimals: 8,
      });
    });

    it('should handle API errors for balance', async () => {
      const address = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      await expect(adapter.getBalance(address)).rejects.toThrow();
    });
  });

  describe('getCurrentBlockNumber', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.blockcypher.com/v1/btc/main' });
    });

    it('should return current block height', async () => {
      const mockApiResponse = {
        data: {
          height: 800000,
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockApiResponse);

      const blockNumber = await adapter.getCurrentBlockNumber();

      expect(blockNumber).toBe(800000);
    });
  });

  describe('getTransactionByHash', () => {
    beforeEach(async () => {
      await adapter.initialize({ rpcUrl: 'https://api.blockcypher.com/v1/btc/main' });
    });

    it('should fetch transaction by hash', async () => {
      const txHash = 'mock_txid_123';
      const mockApiResponse = {
        data: {
          txid: txHash,
          blockheight: 800000,
          confirmations: 6,
          time: Math.floor(Date.now() / 1000),
          value_in: 100010000,
          value_out: 100000000,
          fee: 10000,
          inputs: [
            {
              addresses: ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'],
              value: 100010000,
            },
          ],
          outputs: [
            {
              addresses: ['3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'],
              value: 100000000,
            },
          ],
        },
      };

      mockAxiosInstance.get.mockResolvedValue(mockApiResponse);

      const transaction = await adapter.getTransactionByHash(txHash);

      expect(transaction).toMatchObject({
        hash: txHash,
        status: 'success',
      });
    });

    it('should return null for non-existent transaction', async () => {
      mockAxiosInstance.get.mockRejectedValue({ response: { status: 404 } });

      const transaction = await adapter.getTransactionByHash('nonexistent');

      expect(transaction).toBeNull();
    });
  });
});
