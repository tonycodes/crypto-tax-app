import { EthereumAdapter } from '../blockchain/adapters/ethereum.adapter';
import { SolanaAdapter } from '../blockchain/adapters/solana.adapter';
import { BitcoinAdapter } from '../blockchain/adapters/bitcoin.adapter';
import { CostBasisCalculator } from './cost-basis-calculator';
import { Transaction } from '@crypto-tax-app/shared';
import { TransactionType } from '../blockchain/adapters/adapter.interface';

// Map adapter TransactionType and amount sign to Transaction interface type
function mapTransactionType(adapterType: TransactionType, amount: string): Transaction['type'] {
  const isOutgoing = parseFloat(amount) < 0;

  switch (adapterType) {
    case TransactionType.TRANSFER:
      return isOutgoing ? 'sell' : 'buy'; // Outgoing = sell, Incoming = buy
    case TransactionType.SWAP:
      return 'swap';
    case TransactionType.STAKE:
    case TransactionType.DEPOSIT:
      return 'buy'; // Treat as acquisition
    case TransactionType.UNSTAKE:
    case TransactionType.WITHDRAW:
      return 'sell'; // Treat as disposition
    case TransactionType.MINT:
    case TransactionType.CLAIM:
      return 'airdrop'; // Treat as income
    case TransactionType.BURN:
      return 'fee'; // Treat as fee
    default:
      return isOutgoing ? 'sell' : 'buy'; // Default: sign determines buy/sell
  }
}

async function fetchEthereumTransactions(walletAddress: string): Promise<Transaction[]> {
  console.log('🔍 Fetching Ethereum transactions for wallet:', walletAddress);

  const adapter = new EthereumAdapter();
  await adapter.initialize({
    rpcUrl: process.env['ETHEREUM_RPC_URL'] || 'https://eth.llamarpc.com',
    network: 'mainnet',
  });

  const currentBlock = await adapter.getCurrentBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 100000); // Last ~100k blocks (~20-30 days)

  console.log(`📊 Fetching transactions from block ${fromBlock} to ${currentBlock}...`);

  const rawTransactions = await adapter.getTransactions(walletAddress, {
    fromBlock,
    limit: 50, // Get up to 50 transactions
  });

  console.log(`✅ Found ${rawTransactions.length} raw transactions`);

  // Convert raw transactions to Transaction format
  const transactions: Transaction[] = [];

  for (const rawTx of rawTransactions.slice(0, 10)) {
    // Process first 10 for demo
    try {
      const parsed = await adapter.parseTransaction(rawTx);
      transactions.push({
        id: parsed.hash,
        walletId: 'test-wallet',
        hash: parsed.hash,
        chain: 'ethereum',
        type: mapTransactionType(parsed.type, parsed.amount),
        tokenSymbol: parsed.tokenSymbol,
        tokenAddress: parsed.tokenAddress || '',
        amount: parsed.amount,
        priceUSD: parsed.priceUSD || 0,
        timestamp: new Date(parsed.timestamp),
        blockNumber: parsed.blockNumber || 0,
        isHealed: false,
        metadata: parsed.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.warn(`⚠️ Failed to parse transaction ${rawTx.hash}:`, error);
    }
  }

  console.log(`✅ Successfully parsed ${transactions.length} transactions`);
  return transactions;
}

async function fetchSolanaTransactions(walletAddress: string): Promise<Transaction[]> {
  console.log('🔍 Fetching Solana transactions for wallet:', walletAddress);

  const adapter = new SolanaAdapter();
  // Use Helius RPC for better rate limits and reliability
  await adapter.initialize({
    rpcUrl:
      process.env['SOLANA_RPC_URL'] ||
      'https://mainnet.helius-rpc.com/?api-key=31af627a-a77d-4442-bfda-d879582dcd80',
    network: 'mainnet',
    rateLimitMs: 200, // Rate limiting for Helius RPC
  });

  console.log('📊 Fetching recent transactions...');

  const rawTransactions = await adapter.getTransactions(walletAddress, {
    limit: 20, // Get up to 20 transactions
  });

  console.log(`✅ Found ${rawTransactions.length} raw transactions`);

  // Convert raw transactions to Transaction format
  const transactions: Transaction[] = [];

  for (const rawTx of rawTransactions.slice(0, 10)) {
    // Process first 10 for demo
    try {
      const parsed = await adapter.parseTransaction(rawTx);
      const mappedType = mapTransactionType(parsed.type, parsed.amount);

      // Debug: Log transaction details
      console.log(
        `   Transaction ${parsed.hash.slice(0, 8)}...: ${mappedType} ${parsed.amount} ${parsed.tokenSymbol}`
      );

      transactions.push({
        id: parsed.hash,
        walletId: 'test-wallet',
        hash: parsed.hash,
        chain: 'solana',
        type: mappedType,
        tokenSymbol: parsed.tokenSymbol,
        tokenAddress: parsed.tokenAddress || '',
        amount: parsed.amount,
        priceUSD: parsed.priceUSD || 0,
        timestamp: new Date(parsed.timestamp),
        blockNumber: parsed.blockNumber || 0,
        isHealed: false,
        metadata: parsed.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.warn(`⚠️ Failed to parse transaction ${rawTx.hash}:`, error);
    }
  }

  console.log(`✅ Successfully parsed ${transactions.length} transactions`);
  return transactions;
}

async function fetchBitcoinTransactions(walletAddress: string): Promise<Transaction[]> {
  console.log('🔍 Fetching Bitcoin transactions for wallet:', walletAddress);

  const adapter = new BitcoinAdapter();
  await adapter.initialize({
    rpcUrl: process.env['BITCOIN_RPC_URL'] || 'https://api.blockcypher.com/v1/btc/main',
    network: 'mainnet',
  });

  console.log('📊 Fetching recent transactions...');

  const rawTransactions = await adapter.getTransactions(walletAddress, {
    limit: 10, // Get up to 10 transactions
  });

  console.log(`✅ Found ${rawTransactions.length} raw transactions`);

  // Convert raw transactions to Transaction format
  const transactions: Transaction[] = [];

  for (const rawTx of rawTransactions) {
    try {
      const parsed = await adapter.parseTransaction(rawTx);
      transactions.push({
        id: parsed.hash,
        walletId: 'test-wallet',
        hash: parsed.hash,
        chain: 'bitcoin',
        type: mapTransactionType(parsed.type, parsed.amount),
        tokenSymbol: parsed.tokenSymbol,
        tokenAddress: parsed.tokenAddress || '',
        amount: parsed.amount,
        priceUSD: parsed.priceUSD || 0,
        timestamp: new Date(parsed.timestamp),
        blockNumber: parsed.blockNumber || 0,
        isHealed: false,
        metadata: parsed.metadata || {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.warn(`⚠️ Failed to parse transaction ${rawTx.hash}:`, error);
    }
  }

  console.log(`✅ Successfully parsed ${transactions.length} transactions`);
  return transactions;
}

async function testCostBasisWithRealData(
  chain: 'ethereum' | 'solana' | 'bitcoin',
  walletAddress: string
) {
  console.log(`\n🚀 TESTING COST BASIS CALCULATION WITH REAL ${chain.toUpperCase()} DATA`);
  console.log('='.repeat(70));

  let transactions: Transaction[];

  try {
    switch (chain) {
      case 'ethereum':
        transactions = await fetchEthereumTransactions(walletAddress);
        break;
      case 'solana':
        transactions = await fetchSolanaTransactions(walletAddress);
        break;
      case 'bitcoin':
        transactions = await fetchBitcoinTransactions(walletAddress);
        break;
      default:
        throw new Error(`Unsupported chain: ${chain}`);
    }

    if (transactions.length === 0) {
      console.log('❌ No transactions found for cost basis calculation');
      return;
    }

    console.log('\n📈 Running Cost Basis Calculations...');
    console.log('-'.repeat(40));

    const calculator = new CostBasisCalculator();

    // Test both FIFO and LIFO methods
    const methods = ['FIFO', 'LIFO'] as const;

    for (const method of methods) {
      console.log(`\n🔢 Calculating with ${method} method:`);

      const results = calculator.calculateCostBasis(transactions, {
        method,
        taxYear: 2024, // Current tax year
      });

      console.log(`Found ${results.length} token(s) with transactions:`);

      for (const result of results) {
        console.log(`\n💰 ${result.tokenSymbol} Summary:`);
        console.log(`   Total Acquired: ${result.totalAcquired}`);
        console.log(`   Total Disposed: ${result.totalDisposed}`);
        console.log(`   Remaining Quantity: ${result.remainingQuantity}`);
        console.log(`   Realized Gain/Loss: $${result.realizedGainLoss}`);
        console.log(`   Current Cost Basis: $${result.costBasis}`);

        // Show some transaction details
        const buyTxns = result.entries.filter(e => parseFloat(e.amount) > 0);
        const sellTxns = result.entries.filter(e => parseFloat(e.amount) < 0);

        console.log(`   Buy Transactions: ${buyTxns.length}`);
        console.log(`   Sell Transactions: ${sellTxns.length}`);

        if (sellTxns.length > 0) {
          console.log(
            `   Sample Sell Transaction: ${sellTxns[0]!.amount} ${result.tokenSymbol} @ cost basis $${sellTxns[0]!.costBasisUSD}`
          );
        }
      }
    }

    console.log('\n✅ Cost basis calculation completed successfully!');
  } catch (error: any) {
    console.error('❌ Cost basis test failed:', error.message);
    console.error(error.stack);
  }
}

// Test wallets with real transaction history
const TEST_WALLETS = {
  ethereum: '0x44894aeEe56c2dd589c1D5C8cb04B87576967F97', // Has ETH transactions
  solana: 'HiKmEQrzTd6J3HBjLg2U8qe54ZPsJXL7XAFyRhvpMchx', // Has SOL transactions
  bitcoin: '34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo', // Has BTC transactions
};

// Check command line arguments
const [, , chainArg, walletArg] = process.argv;

if (!chainArg) {
  console.log('Usage: npx tsx test-live-cost-basis.ts <chain> [wallet]');
  console.log('\nSupported chains: ethereum, solana, bitcoin');
  console.log('\nExamples:');
  console.log('  npx tsx test-live-cost-basis.ts ethereum');
  console.log('  npx tsx test-live-cost-basis.ts solana');
  console.log('  npx tsx test-live-cost-basis.ts bitcoin');
  console.log(
    '  npx tsx test-live-cost-basis.ts ethereum 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1'
  );
  console.log('\nDefault test wallets:');
  Object.entries(TEST_WALLETS).forEach(([chain, wallet]) => {
    console.log(`  ${chain}: ${wallet}`);
  });
  process.exit(1);
}

const chain = chainArg.toLowerCase() as 'ethereum' | 'solana' | 'bitcoin';
const wallet = walletArg || TEST_WALLETS[chain];

if (!wallet) {
  console.error(`❌ No wallet provided for chain: ${chain}`);
  process.exit(1);
}

testCostBasisWithRealData(chain, wallet).catch(console.error);
