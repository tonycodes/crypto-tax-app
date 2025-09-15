import { describe, it, expect, beforeAll } from '@jest/globals';
import { EthereumAdapter } from './ethereum.adapter';
import { ChainType, BlockchainConfig } from './adapter.interface';

// Skip these tests in CI/CD - only run locally when needed
describe.skip('EthereumAdapter - Real Blockchain Integration', () => {
  let adapter: EthereumAdapter;
  const realWalletAddress = '0x8e350041306956EABB18fDd0C2B11C18c8879d78';

  beforeAll(async () => {
    adapter = new EthereumAdapter();

    // Use a public Ethereum RPC endpoint
    const config: BlockchainConfig = {
      // Using public Ethereum RPC - may be rate limited
      rpcUrl: 'https://eth.llamarpc.com',
      network: 'mainnet',
    };

    await adapter.initialize(config);
  }, 30000); // 30 second timeout for initialization

  describe('Real wallet validation', () => {
    it('should validate the real wallet address', () => {
      expect(adapter.isValidAddress(realWalletAddress)).toBe(true);
    });
  });

  describe('Real balance check', () => {
    it('should get ETH balance for real wallet', async () => {
      const balances = await adapter.getBalance(realWalletAddress);

      console.log('Real ETH Balance Response:', JSON.stringify(balances, null, 2));

      expect(balances).toHaveLength(1);
      expect(balances[0]).toMatchObject({
        address: realWalletAddress,
        chain: ChainType.ETHEREUM,
        tokenSymbol: 'ETH',
        decimals: 18,
      });
      expect(balances[0]?.balance).toBeDefined();
      expect(typeof balances[0]?.balance).toBe('string');

      // Balance should be a valid number string
      expect(() => BigInt(balances[0]?.balance || '0')).not.toThrow();
    }, 30000);

    it('should get USDT balance for real wallet', async () => {
      // USDT contract address on Ethereum mainnet
      const usdtAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

      const balances = await adapter.getBalance(realWalletAddress, usdtAddress);

      console.log('Real USDT Balance Response:', JSON.stringify(balances, null, 2));

      expect(balances).toHaveLength(1);
      expect(balances[0]).toMatchObject({
        address: realWalletAddress,
        chain: ChainType.ETHEREUM,
        tokenSymbol: 'USDT',
        tokenAddress: usdtAddress,
        decimals: 6, // USDT has 6 decimals
      });
      expect(balances[0]?.balance).toBeDefined();
      expect(typeof balances[0]?.balance).toBe('string');
    }, 30000);
  });

  describe('Real transaction fetching', () => {
    it('should fetch recent transactions for real wallet', async () => {
      // Get transactions from a recent block range
      // Using a smaller range to avoid rate limits
      const currentBlock = await adapter.getCurrentBlockNumber();
      const fromBlock = currentBlock - 10000; // Last ~10000 blocks (~1-2 days)

      console.log(`Fetching transactions from block ${fromBlock} to ${currentBlock}`);

      const transactions = await adapter.getTransactions(realWalletAddress, {
        fromBlock,
        toBlock: currentBlock,
        limit: 10,
      });

      console.log(`Found ${transactions.length} transactions`);

      if (transactions.length > 0) {
        console.log('Sample Transaction:', JSON.stringify(transactions[0], null, 2));

        // Verify transaction structure
        const tx = transactions[0];
        expect(tx).toHaveProperty('hash');
        expect(tx).toHaveProperty('from');
        expect(tx).toHaveProperty('timestamp');
        expect(tx).toHaveProperty('value');
        expect(tx).toHaveProperty('status');

        // Verify data types
        expect(typeof tx?.hash).toBe('string');
        expect(tx?.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(typeof tx?.from).toBe('string');
        expect(tx?.from.toLowerCase()).toBe(tx?.from); // Should be lowercase
        expect(typeof tx?.timestamp).toBe('number');
        expect(tx?.timestamp).toBeGreaterThan(0);
        expect(typeof tx?.value).toBe('string');
        expect(['success', 'failed', 'pending']).toContain(tx?.status);

        // Parse the transaction
        const parsed = await adapter.parseTransaction(tx);
        console.log('Parsed Transaction:', JSON.stringify(parsed, null, 2));

        expect(parsed).toHaveProperty('chain', ChainType.ETHEREUM);
        expect(parsed).toHaveProperty('type');
        expect(parsed).toHaveProperty('tokenSymbol');
        expect(parsed).toHaveProperty('amount');
      }
    }, 60000); // 60 second timeout for transaction fetching
  });

  describe('Real block number', () => {
    it('should get current block number', async () => {
      const blockNumber = await adapter.getCurrentBlockNumber();

      console.log('Current Block Number:', blockNumber);

      expect(blockNumber).toBeGreaterThan(18000000); // Ethereum mainnet is well past block 18M
      expect(Number.isInteger(blockNumber)).toBe(true);
    }, 30000);
  });

  describe('Real transaction by hash', () => {
    it('should fetch a known transaction by hash', async () => {
      // A known Ethereum transaction (USDT transfer)
      const knownTxHash = '0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060';

      const transaction = await adapter.getTransactionByHash(knownTxHash);

      console.log('Known Transaction:', JSON.stringify(transaction, null, 2));

      if (transaction) {
        expect(transaction.hash).toBe(knownTxHash);
        expect(transaction.from).toBeDefined();
        expect(transaction.to).toBeDefined();
        expect(transaction.value).toBeDefined();
        expect(transaction.status).toBe('success');

        // This is the first ever USDT transfer, so we know some details
        expect(transaction.from.toLowerCase()).toBe(
          '0x36928500bc1dcd7af6a2b4008875cc336b927d57'.toLowerCase()
        );
      }
    }, 30000);
  });
});

// Run this test to see actual responses
describe('EthereumAdapter - Real Data Inspection', () => {
  it('should inspect real blockchain data', async () => {
    const adapter = new EthereumAdapter();

    // Use a public RPC endpoint
    await adapter.initialize({
      rpcUrl: 'https://eth.llamarpc.com',
      network: 'mainnet',
    });

    const realWalletAddress = '0x8e350041306956EABB18fDd0C2B11C18c8879d78';

    console.log('\n=== REAL WALLET DATA INSPECTION ===\n');

    // Get ETH balance
    const ethBalance = await adapter.getBalance(realWalletAddress);
    console.log('ETH Balance:', JSON.stringify(ethBalance, null, 2));

    // Get current block
    const currentBlock = await adapter.getCurrentBlockNumber();
    console.log('\nCurrent Block:', currentBlock);

    // Try to get some recent transactions (smaller range to avoid rate limits)
    try {
      const transactions = await adapter.getTransactions(realWalletAddress, {
        fromBlock: currentBlock - 1000, // Last ~1000 blocks
        toBlock: currentBlock,
        limit: 5,
      });

      console.log('\nTransactions found:', transactions.length);
      if (transactions.length > 0) {
        console.log('\nFirst transaction structure:');
        console.log(JSON.stringify(transactions[0], null, 2));

        // Parse the transaction
        const parsed = await adapter.parseTransaction(transactions[0]);
        console.log('\nParsed transaction:');
        console.log(JSON.stringify(parsed, null, 2));
      }
    } catch (error) {
      console.log('\nError fetching transactions:', error);
    }

    console.log('\n=== END OF INSPECTION ===\n');
  }, 60000);
});
