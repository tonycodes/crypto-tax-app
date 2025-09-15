# Ethereum Adapter - Real Blockchain Response Reference

This document contains actual blockchain responses from Ethereum mainnet for reference when working with the Ethereum adapter. These responses were captured from real RPC calls and should be used to ensure test mocks accurately represent real blockchain data.

## Test Wallet

- **Address**: `0x8e350041306956EABB18fDd0C2B11C18c8879d78`
- **Network**: Ethereum Mainnet
- **RPC Used**: `https://eth.llamarpc.com`

## Real Response Structures

### 1. ETH Balance Response

```json
{
  "address": "0x8e350041306956EABB18fDd0C2B11C18c8879d78",
  "chain": "ethereum",
  "tokenSymbol": "ETH",
  "balance": "0",
  "decimals": 18
}
```

**Key Points**:

- Balance is returned as a string (for BigInt precision)
- Always includes decimals (18 for ETH)
- Chain identifier is lowercase "ethereum"

### 2. ERC20 Token Balance Response (USDT Example)

```json
{
  "address": "0x8e350041306956EABB18fDd0C2B11C18c8879d78",
  "chain": "ethereum",
  "tokenSymbol": "USDT",
  "tokenAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "balance": "0",
  "decimals": 6
}
```

**Key Points**:

- USDT has 6 decimals (not 18 like ETH)
- Token address is included for ERC20 tokens
- Balance must be string to avoid BigInt serialization issues

### 3. Raw Transaction Structure

```json
{
  "hash": "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060",
  "timestamp": 1438918233000,
  "from": "0xa1e4380a3b1f749673e270229993ee55f35663b4",
  "value": "31337",
  "fee": "1050000000000000000",
  "status": "success",
  "rawData": {
    "logs": [],
    "gasUsed": "21000",
    "gasPrice": "50000000000000"
  },
  "blockNumber": 46147,
  "to": "0x5df9b87991262f6ba471f09758cde1c0fc1de734"
}
```

**Key Points**:

- Timestamp is in milliseconds (not seconds)
- All addresses are lowercase
- Value and fee are strings (wei amounts)
- Status is "success" or "failed" (not boolean)
- Gas values in rawData are strings

### 4. Parsed Transaction Structure

```json
{
  "hash": "0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060",
  "chain": "ethereum",
  "type": "transfer",
  "from": "0xa1e4380a3b1f749673e270229993ee55f35663b4",
  "tokenSymbol": "ETH",
  "amount": "31337",
  "timestamp": "2015-08-07T03:30:33.000Z",
  "status": "success",
  "metadata": {
    "logs": [],
    "gasUsed": "21000",
    "gasPrice": "50000000000000"
  },
  "to": "0x5df9b87991262f6ba471f09758cde1c0fc1de734",
  "feeAmount": "1050000000000000000",
  "blockNumber": 46147
}
```

**Key Points**:

- Type is lowercase enum value ("transfer", "swap", etc.)
- Timestamp is converted to Date/ISO string
- Metadata contains the original rawData
- Amount is in wei (as string)

## RPC Limitations and Error Handling

### Block Range Limits

- **Maximum blocks per getLogs query**: 1000
- **Error message**: "eth_getLogs range is too large, max is 1k blocks"
- **Solution**: Chunk requests into 1000 block ranges

### Rate Limiting

- Public RPCs like `eth.llamarpc.com` have rate limits
- Implement retry logic with exponential backoff
- Consider using multiple RPC endpoints for failover

### Common Values

- **Current block number** (as of testing): ~23,368,504
- **Standard gas for ETH transfer**: 21000
- **Wei to ETH conversion**: 1 ETH = 10^18 wei

## Testing Considerations

### Mock Data Requirements

When creating mocks for tests, ensure:

1. **BigInt values** are used for:
   - `value` (transaction value in wei)
   - `gasPrice`
   - `gasUsed`
   - ERC20 token balances

2. **String conversions** for serialization:
   - Always convert BigInt to string before JSON operations
   - Use `.toString()` method, not String() constructor

3. **Address formatting**:
   - Always lowercase for consistency
   - Include full checksummed address in validation

4. **Block timestamps**:
   - Blockchain returns seconds since epoch
   - Multiply by 1000 for JavaScript milliseconds

## Implementation Notes

### Critical Functions

1. **getBalance()**:
   - Returns array of WalletBalance objects
   - Must handle both ETH and ERC20 tokens
   - BigInt values must be converted to strings

2. **getTransactions()**:
   - Must chunk large block ranges (max 1000 blocks)
   - Needs to query both sender and receiver logs
   - Handle rate limiting with retry logic

3. **parseTransaction()**:
   - Detect transaction type from logs
   - Parse ERC20 transfers from Transfer event logs
   - Convert wei amounts to strings for storage

### Error Types

- `NetworkError`: For RPC communication issues
- `RateLimitError`: When hitting RPC rate limits
- `InvalidAddressError`: For malformed addresses
- Generic errors should be wrapped in BlockchainError

## Validation Checklist

When implementing or testing Ethereum adapter:

- [ ] All BigInt values are properly handled
- [ ] Block range chunking is implemented (1000 max)
- [ ] Rate limiting retry logic is in place
- [ ] Addresses are normalized to lowercase
- [ ] Timestamps are converted correctly (seconds → milliseconds)
- [ ] ERC20 token decimals are respected (USDT=6, not 18)
- [ ] Transaction logs are parsed for both sender and receiver
- [ ] Error handling covers all RPC failure scenarios
- [ ] Mock data matches real response structures exactly
