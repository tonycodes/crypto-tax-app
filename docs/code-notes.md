# Code Notes for Crypto Tax App

These notes provide guidelines for AI agents or developers to reference when writing or reviewing code. They emphasize best practices, patterns, and specifics from the implementation plan to ensure consistency, modularity, and security.

## General Guidelines

### Language & Style
- Use TypeScript for all code (strong typing for safety)
- Follow ESLint/Prettier rules: 2-space indentation, single quotes, semi-colons
- No unused vars; async/await over callbacks

### Error Handling
- All async operations (e.g., SDK calls, DB queries) must use try/catch
- Retry on transient errors (e.g., RPC rate limits) with exponential backoff (e.g., via p-retry)
- Log errors with context (e.g., Winston logger)

### Security
- Encrypt wallet addresses/txns in DB (e.g., Prisma encrypt fields)
- Use parameterized queries (Prisma handles this)
- Validate inputs (e.g., Joi/Zod schemas for API endpoints)
- No private keys stored—ever

### Performance
- Offload heavy tasks (syncs, heals) to BullMQ queues
- Cache frequent data (e.g., prices in Redis with TTL=1hr)

### Modularity
- Use dependency injection for adapters (e.g., via tsyringe)
- Config-driven: Load RPC URLs, API keys from .env or config.json

## Specific Patterns

### Blockchain Adapters
Implement `IBlockchainAdapter` interface with methods like `fetchTxns(wallet: string): Promise<Txn[]>`. Async calls only. For Solana: Check program IDs before parsing (e.g., Jupiter/Raydium). Example:

```typescript
export class SolanaAdapter implements IBlockchainAdapter {
  private connection: Connection;

  constructor() {
    this.connection = new Connection(process.env.SOLANA_RPC);
  }

  async fetchTxns(wallet: string): Promise<Txn[]> {
    try {
      // Fetch sigs, get txns...
      // If Jupiter: parseSwapInstruction(txn);
      // Handle errors with retries
    } catch (error) {
      // Log and handle appropriately
      throw error;
    }
  }
}
```

### AI Integration
- Backend-only for security
- Prompts should be templated (e.g., Handlebars)
- For MCP: Expose tools as JSON schemas in config; e.g., `{ name: 'getPrice', parameters: { date: 'string' } }`
- AI calls: `client.messages.create({ tools: mcpTools })`
- Add MCP: "Expose tools via schemas; AI prompts include MCP config."

### DB Operations
- Use Prisma transactions for atomicity (e.g., `prisma.$transaction([...])`)
- Models: User (id, email, plan), Wallet (userId, address, chain), Txn (walletId, hash, amountIn, etc.)

### Payments
- Generate unique addresses per payment (e.g., via multisig)
- Watchers: Use SDK subscriptions (e.g., `connection.onAccountChange(ourWallet)`)
- Confirm with min confirmations

### UI Components
- React hooks for state (e.g., `useSyncProgress()` via WebSockets)
- Tailwind: Utility-first; no custom CSS unless needed

## Architecture Patterns

### Dependency Injection
Use a container pattern for better testability:

```typescript
// services/Container.ts
import { Container } from 'inversify';
import { IBlockchainAdapter, SolanaAdapter, EthereumAdapter } from './adapters';

const container = new Container();
container.bind<IBlockchainAdapter>('SolanaAdapter').to(SolanaAdapter);
container.bind<IBlockchainAdapter>('EthereumAdapter').to(EthereumAdapter);

export { container };
```

### Configuration Management
Centralize configuration with validation:

```typescript
// config/index.ts
import { z } from 'zod';

const configSchema = z.object({
  database: z.object({
    url: z.string(),
  }),
  blockchain: z.object({
    solana: z.object({
      rpcUrl: z.string(),
      heliusApiKey: z.string().optional(),
    }),
    ethereum: z.object({
      rpcUrl: z.string(),
      alchemyApiKey: z.string().optional(),
    }),
  }),
  ai: z.object({
    openaiApiKey: z.string(),
    serpApiKey: z.string().optional(),
  }),
});

export const config = configSchema.parse({
  database: {
    url: process.env.DATABASE_URL,
  },
  blockchain: {
    solana: {
      rpcUrl: process.env.SOLANA_RPC_URL,
      heliusApiKey: process.env.HELIUS_API_KEY,
    },
    ethereum: {
      rpcUrl: process.env.ETHEREUM_RPC_URL,
      alchemyApiKey: process.env.ALCHEMY_API_KEY,
    },
  },
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY,
    serpApiKey: process.env.SERP_API_KEY,
  },
});
```

### Error Handling Patterns
Create consistent error handling:

```typescript
// utils/errors.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

// Async wrapper for consistent error handling
export const asyncHandler = (fn: Function) => (req: any, res: any, next: any) =>
  Promise.resolve(fn(req, res, next)).catch(next);
```

### Logging Pattern
Use structured logging:

```typescript
// utils/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}
```

## Solana-Specific Patterns

### Transaction Parsing
Implement parser detection and routing:

```typescript
// adapters/solana/parsers/index.ts
import { ParsedTransaction } from '@solana/web3.js';

export interface TxnParser {
  canParse(txn: ParsedTransaction): boolean;
  parse(txn: ParsedTransaction): ParsedTxnData;
}

export class JupiterParser implements TxnParser {
  canParse(txn: ParsedTransaction): boolean {
    return txn.transaction.message.instructions.some(
      ix => ix.programId.equals(JUPITER_PROGRAM_ID)
    );
  }

  parse(txn: ParsedTransaction): ParsedTxnData {
    // Use @jup-ag/instruction-parser
    const parsed = parseSwapInstruction(txn);
    return {
      type: 'swap',
      inputToken: parsed.inputMint,
      outputToken: parsed.outputMint,
      inputAmount: parsed.inputAmount,
      outputAmount: parsed.outputAmount,
      fees: parsed.fees,
    };
  }
}
```

### MCP Integration Pattern
Structure MCP tools for dynamic AI access:

```typescript
// ai/mcp/tools.ts
export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  handler: (params: any) => Promise<any>;
}

export const priceHistoryTool: MCPTool = {
  name: 'get_price_history',
  description: 'Get historical price for a token at a specific date',
  parameters: {
    type: 'object',
    properties: {
      tokenSymbol: { type: 'string' },
      date: { type: 'string', format: 'date' },
      source: { type: 'string', enum: ['coingecko', 'coinmarketcap'] },
    },
    required: ['tokenSymbol', 'date'],
  },
  handler: async (params) => {
    // Implementation
  },
};
```

## Best Practices

### Decoupling
- For new chains/parsers, add to config/adapters—no core code changes
- Use interfaces and dependency injection throughout
- Keep business logic separate from framework-specific code

### Logging
- Debug for dev, info for prod; include userId for traceability
- Structure logs with consistent fields (timestamp, level, userId, operation, etc.)

### Versioning
- Pin deps in package.json; use semantic versioning for app releases
- Use exact versions for blockchain SDKs to prevent breaking changes

### Testing Patterns
- Mock external dependencies (RPC calls, AI APIs, MCP tools)
- Use test factories for consistent test data generation
- Separate unit tests from integration tests clearly

### Security Patterns
- Never log sensitive data (private keys, API keys, user data)
- Validate all inputs at API boundaries
- Use environment-specific configurations
- Implement rate limiting on all public endpoints
- Use HTTPS everywhere and secure headers

Reference this for code generation/review. Cross-check with `testing-notes.md` for TDD alignment.