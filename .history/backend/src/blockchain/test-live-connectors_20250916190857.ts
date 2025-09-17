import { EthereumAdapter } from './adapters/ethereum.adapter';
import { SolanaAdapter } from './adapters/solana.adapter';
import { BitcoinAdapter } from './adapters/bitcoin.adapter';

async function testEthereumConnector(walletAddress: string) {
  console.log('\n=== TESTING ETHEREUM CONNECTOR ===');
  console.log('Wallet:', walletAddress);
  console.log('==================================\n');

  const adapter = new EthereumAdapter();

  try {
    await adapter.initialize({
      rpcUrl: 'https://eth.llamarpc.com',
      network: 'mainnet',
    });

    // Test balance
    console.log('1. Getting ETH Balance...');
    const ethBalance = await adapter.getBalance(walletAddress);
    console.log('ETH Balance:', JSON.stringify(ethBalance, null, 2));

    // Test USDT balance
    console.log('\n2. Getting USDT Balance...');
    const usdtAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    try {
      const usdtBalance = await adapter.getBalance(walletAddress, usdtAddress);
      console.log('USDT Balance:', JSON.stringify(usdtBalance, null, 2));
    } catch (error: any) {
      console.log('USDT Balance Error:', error.message);
    }

    // Test transaction fetching
    console.log('\n3. Getting current block...');
    const currentBlock = await adapter.getCurrentBlockNumber();
    console.log('Current Block:', currentBlock);

    console.log('\n4. Fetching recent transactions...');
    const fromBlock = Math.max(0, currentBlock - 1000);
    const transactions = await adapter.getTransactions(walletAddress, {
      fromBlock,
      limit: 3,
    });

    console.log(`Found ${transactions.length} transactions`);
    if (transactions.length > 0) {
      console.log('\nParsing first transaction...');
      const parsed = await adapter.parseTransaction(transactions[0]!);
      console.log('Parsed:', JSON.stringify(parsed, null, 2));
    }

    console.log('\n✅ Ethereum connector test completed successfully');
  } catch (error: any) {
    console.error('❌ Ethereum connector test failed:', error.message);
  }
}

async function testSolanaConnector(walletAddress: string) {
  console.log('\n=== TESTING SOLANA CONNECTOR ===');
  console.log('Wallet:', walletAddress);
  console.log('================================\n');

  const adapter = new SolanaAdapter();

  try {
    await adapter.initialize({
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      network: 'mainnet',
    });

    // Test SOL balance
    console.log('1. Getting SOL Balance...');
    const solBalance = await adapter.getBalance(walletAddress);
    console.log('SOL Balance:', JSON.stringify(solBalance, null, 2));

    // Test USDC balance
    console.log('\n2. Getting USDC Balance...');
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    try {
      const usdcBalance = await adapter.getBalance(walletAddress, usdcMint);
      console.log('USDC Balance:', JSON.stringify(usdcBalance, null, 2));
    } catch (error: any) {
      console.log('USDC Balance Error:', error.message);
    }

    // Test current slot
    console.log('\n3. Getting current slot...');
    const currentSlot = await adapter.getCurrentBlockNumber();
    console.log('Current Slot:', currentSlot);

    // Test transaction fetching
    console.log('\n4. Fetching recent transactions...');
    const transactions = await adapter.getTransactions(walletAddress, { limit: 3 });

    console.log(`Found ${transactions.length} transactions`);
    if (transactions.length > 0) {
      console.log('\nParsing first transaction...');
      const parsed = await adapter.parseTransaction(transactions[0]!);
      console.log('Parsed:', JSON.stringify(parsed, null, 2));
    }

    console.log('\n✅ Solana connector test completed successfully');
  } catch (error: any) {
    console.error('❌ Solana connector test failed:', error.message);
  }
}

async function testBitcoinConnector(walletAddress: string) {
  console.log('\n=== TESTING BITCOIN CONNECTOR ===');
  console.log('Wallet:', walletAddress);
  console.log('=================================\n');

  const adapter = new BitcoinAdapter();

  try {
    await adapter.initialize({
      rpcUrl: 'https://api.blockcypher.com/v1/btc/main',
      network: 'mainnet',
    });

    // Test BTC balance
    console.log('1. Getting BTC Balance...');
    const btcBalance = await adapter.getBalance(walletAddress);
    console.log('BTC Balance:', JSON.stringify(btcBalance, null, 2));

    // Test current block
    console.log('\n2. Getting current block height...');
    const currentBlock = await adapter.getCurrentBlockNumber();
    console.log('Current Block:', currentBlock);

    // Test transaction fetching
    console.log('\n3. Fetching recent transactions...');
    const transactions = await adapter.getTransactions(walletAddress, { limit: 3 });

    console.log(`Found ${transactions.length} transactions`);
    if (transactions.length > 0) {
      console.log('\nParsing first transaction...');
      const parsed = await adapter.parseTransaction(transactions[0]!);
      console.log('Parsed:', JSON.stringify(parsed, null, 2));
    }

    console.log('\n✅ Bitcoin connector test completed successfully');
  } catch (error: any) {
    console.error('❌ Bitcoin connector test failed:', error.message);
  }
}

async function runAllConnectorTests(ethWallet: string, solWallet: string, btcWallet: string) {
  console.log('🚀 STARTING LIVE BLOCKCHAIN CONNECTOR TESTS');
  console.log('==========================================\n');

  await testEthereumConnector(ethWallet);
  await testSolanaConnector(solWallet);
  await testBitcoinConnector(btcWallet);

  console.log('\n🎉 ALL CONNECTOR TESTS COMPLETED');
  console.log('================================');
}

// Check command line arguments
const [, , ethWallet, solWallet, btcWallet] = process.argv;

if (!ethWallet || !solWallet || !btcWallet) {
  console.log('Usage: npx tsx test-live-connectors.ts <eth_wallet> <sol_wallet> <btc_wallet>');
  console.log('\nExample:');
  console.log(
    'npx tsx test-live-connectors.ts 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1 8qJSyQprMC57TWKaYEmetUR3UUiTP2M3hXdcvFhkZdmv 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'
  );
  process.exit(1);
}

runAllConnectorTests(ethWallet, solWallet, btcWallet).catch(console.error);
