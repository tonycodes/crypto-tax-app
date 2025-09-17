import { CostBasisCalculator } from './cost-basis-calculator';
import { Transaction } from '@crypto-tax-app/shared';

/**
 * Demo script showing cost basis calculations with realistic crypto trading scenarios
 */
async function demoCostBasisCalculations() {
  console.log('🚀 CRYPTO TAX COST BASIS CALCULATION DEMO');
  console.log('==========================================\n');

  const calculator = new CostBasisCalculator();

  // Scenario 1: Simple ETH trading with gains
  console.log('📊 SCENARIO 1: ETH Trading with FIFO Method');
  console.log('--------------------------------------------');

  const ethTransactions: Transaction[] = [
    {
      id: '1',
      walletId: 'demo-wallet',
      hash: '0x123',
      chain: 'ethereum',
      type: 'buy',
      tokenSymbol: 'ETH',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      amount: '2.0', // Bought 2 ETH
      priceUSD: 2000, // $2000/ETH = $4000 total
      timestamp: new Date('2024-01-15'),
      blockNumber: 19000000,
      isHealed: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      walletId: 'demo-wallet',
      hash: '0x456',
      chain: 'ethereum',
      type: 'buy',
      tokenSymbol: 'ETH',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      amount: '1.5', // Bought 1.5 ETH more
      priceUSD: 2500, // $2500/ETH = $3750 total
      timestamp: new Date('2024-02-20'),
      blockNumber: 19100000,
      isHealed: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '3',
      walletId: 'demo-wallet',
      hash: '0x789',
      chain: 'ethereum',
      type: 'sell',
      tokenSymbol: 'ETH',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      amount: '-1.0', // Sold 1 ETH
      priceUSD: 3000, // $3000/ETH = $3000 proceeds
      timestamp: new Date('2024-03-10'),
      blockNumber: 19200000,
      isHealed: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const ethResults = calculator.calculateCostBasis(ethTransactions, {
    method: 'FIFO',
    taxYear: 2024,
  });

  console.log('ETH Cost Basis Results:');
  ethResults.forEach(result => {
    console.log(`  Total Acquired: ${result.totalAcquired} ETH`);
    console.log(`  Total Disposed: ${result.totalDisposed} ETH`);
    console.log(`  Remaining: ${result.remainingQuantity} ETH`);
    console.log(`  Realized Gain/Loss: $${result.realizedGainLoss}`);
    console.log(`  Current Cost Basis: $${result.costBasis}`);
    console.log(`  Calculation: Sold 1 ETH @ $3000, cost basis $2000 = +$1000 gain`);
  });

  console.log('\n📊 SCENARIO 2: Same ETH trades with LIFO Method');
  console.log('------------------------------------------------');

  const ethResultsLIFO = calculator.calculateCostBasis(ethTransactions, {
    method: 'LIFO',
    taxYear: 2024,
  });

  console.log('ETH Cost Basis Results (LIFO):');
  ethResultsLIFO.forEach(result => {
    console.log(`  Total Acquired: ${result.totalAcquired} ETH`);
    console.log(`  Total Disposed: ${result.totalDisposed} ETH`);
    console.log(`  Remaining: ${result.remainingQuantity} ETH`);
    console.log(`  Realized Gain/Loss: $${result.realizedGainLoss}`);
    console.log(`  Current Cost Basis: $${result.costBasis}`);
    console.log(`  Calculation: Sold 1 ETH @ $3000, cost basis $2500 = +$500 gain`);
  });

  // Scenario 2: Multi-token portfolio
  console.log('\n📊 SCENARIO 3: Multi-Token Portfolio (SOL & USDC)');
  console.log('---------------------------------------------------');

  const multiTokenTransactions: Transaction[] = [
    // SOL transactions
    {
      id: 'sol-1',
      walletId: 'demo-wallet',
      hash: 'sol123',
      chain: 'solana',
      type: 'buy',
      tokenSymbol: 'SOL',
      tokenAddress: 'So11111111111111111111111111111111111111112',
      amount: '10.0',
      priceUSD: 100,
      timestamp: new Date('2024-01-01'),
      blockNumber: 200000000,
      isHealed: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'sol-2',
      walletId: 'demo-wallet',
      hash: 'sol456',
      chain: 'solana',
      type: 'sell',
      tokenSymbol: 'SOL',
      tokenAddress: 'So11111111111111111111111111111111111111112',
      amount: '-3.0',
      priceUSD: 150,
      timestamp: new Date('2024-06-01'),
      blockNumber: 210000000,
      isHealed: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    // USDC transactions
    {
      id: 'usdc-1',
      walletId: 'demo-wallet',
      hash: 'usdc123',
      chain: 'ethereum',
      type: 'buy',
      tokenSymbol: 'USDC',
      tokenAddress: '0xa0b86a33e6c7c5b5e7e7e7e7e7e7e7e7e7e7e7e7e7',
      amount: '5000.0',
      priceUSD: 1.0,
      timestamp: new Date('2024-01-01'),
      blockNumber: 19000000,
      isHealed: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'usdc-2',
      walletId: 'demo-wallet',
      hash: 'usdc456',
      chain: 'ethereum',
      type: 'sell',
      tokenSymbol: 'USDC',
      tokenAddress: '0xa0b86a33e6c7c5b5e7e7e7e7e7e7e7e7e7e7e7e7e7',
      amount: '-1000.0',
      priceUSD: 1.0,
      timestamp: new Date('2024-06-01'),
      blockNumber: 19500000,
      isHealed: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const multiResults = calculator.calculateCostBasis(multiTokenTransactions, {
    method: 'FIFO',
    taxYear: 2024,
  });

  console.log('Multi-Token Results:');
  multiResults.forEach(result => {
    console.log(`\n${result.tokenSymbol}:`);
    console.log(`  Total Acquired: ${result.totalAcquired}`);
    console.log(`  Total Disposed: ${result.totalDisposed}`);
    console.log(`  Remaining: ${result.remainingQuantity}`);
    console.log(`  Realized Gain/Loss: $${result.realizedGainLoss}`);
    console.log(`  Current Cost Basis: $${result.costBasis}`);
  });

  console.log('\n💡 KEY INSIGHTS:');
  console.log('---------------');
  console.log('• FIFO vs LIFO can significantly impact reported gains/losses');
  console.log('• Cost basis calculations handle multiple tokens separately');
  console.log('• Remaining holdings maintain their original cost basis');
  console.log('• Realized gains/losses are calculated at time of disposition');
  console.log('• Tax implications depend on jurisdiction and holding period');

  console.log('\n✅ Cost basis calculation demo completed successfully!');
}

// Run the demo
demoCostBasisCalculations().catch(console.error);
