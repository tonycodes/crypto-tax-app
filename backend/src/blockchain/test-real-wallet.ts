import { EthereumAdapter } from './adapters/ethereum.adapter';

async function testRealWallet() {
  const adapter = new EthereumAdapter();
  const realWalletAddress = '0x8e350041306956EABB18fDd0C2B11C18c8879d78';

  console.log('\n=== TESTING REAL ETHEREUM WALLET ===');
  console.log('Wallet:', realWalletAddress);
  console.log('=====================================\n');

  try {
    // Initialize with public RPC
    await adapter.initialize({
      rpcUrl: 'https://eth.llamarpc.com',
      network: 'mainnet',
    });

    // 1. Test ETH Balance
    console.log('1. Getting ETH Balance...');
    const ethBalance = await adapter.getBalance(realWalletAddress);
    console.log('ETH Balance Response:');
    console.log(JSON.stringify(ethBalance, null, 2));
    console.log('\n');

    // 2. Test USDT Balance
    console.log('2. Getting USDT Balance...');
    const usdtAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    try {
      const usdtBalance = await adapter.getBalance(realWalletAddress, usdtAddress);
      console.log('USDT Balance Response:');
      console.log(JSON.stringify(usdtBalance, null, 2));
    } catch (error: any) {
      console.log('USDT Balance Error:', error.message);
    }
    console.log('\n');

    // 3. Get current block number
    console.log('3. Getting current block number...');
    const currentBlock = await adapter.getCurrentBlockNumber();
    console.log('Current Block:', currentBlock);
    console.log('\n');

    // 4. Try to fetch recent transactions
    console.log('4. Fetching recent transactions...');
    console.log('(Using small block range to avoid rate limits)');

    try {
      const fromBlock = currentBlock - 100; // Last 100 blocks only
      const transactions = await adapter.getTransactions(realWalletAddress, {
        fromBlock,
        toBlock: currentBlock,
        limit: 5,
      });

      console.log(
        `Found ${transactions.length} transactions in blocks ${fromBlock}-${currentBlock}`
      );

      if (transactions.length > 0) {
        console.log('\nFirst transaction raw data:');
        console.log(JSON.stringify(transactions[0], null, 2));

        console.log('\nParsing first transaction...');
        const parsed = await adapter.parseTransaction(transactions[0]!);
        console.log('Parsed transaction:');
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        console.log('No transactions found in recent blocks.');
        console.log('Trying broader search...');

        // Try a broader range
        const broadFromBlock = currentBlock - 10000;
        const broadTx = await adapter.getTransactions(realWalletAddress, {
          fromBlock: broadFromBlock,
          toBlock: currentBlock,
          limit: 1,
        });

        if (broadTx.length > 0) {
          console.log(`\nFound transaction in blocks ${broadFromBlock}-${currentBlock}:`);
          console.log(JSON.stringify(broadTx[0], null, 2));
        } else {
          console.log('No transactions found even in broader range.');
        }
      }
    } catch (error: any) {
      console.log('Error fetching transactions:', error.message);
      if (error.message.includes('rate limit')) {
        console.log('(This is likely due to rate limiting on the public RPC)');
      }
    }

    // 5. Test a known transaction
    console.log('\n5. Fetching a known transaction...');
    const knownTxHash = '0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060';
    console.log('Transaction hash:', knownTxHash);

    const knownTx = await adapter.getTransactionByHash(knownTxHash);
    if (knownTx) {
      console.log('Known transaction data:');
      console.log(JSON.stringify(knownTx, null, 2));

      console.log('\nParsing known transaction...');
      const parsedKnown = await adapter.parseTransaction(knownTx);
      console.log('Parsed known transaction:');
      console.log(JSON.stringify(parsedKnown, null, 2));
    }
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }

  console.log('\n=== END OF TEST ===\n');
}

// Run the test
testRealWallet().catch(console.error);
