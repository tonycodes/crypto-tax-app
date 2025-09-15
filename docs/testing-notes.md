# Testing Notes for Crypto Tax App

These notes guide AI agents or testers on achieving 100% test coverage via TDD. Follow Red-Green-Refactor: Write failing tests first.

## General Guidelines

### Framework
- **Jest/Vitest** for unit/integration tests
- **Cypress** for E2E testing
- **Supertest** for API testing
- **React Testing Library** for React component testing

### Coverage
- Aim for 100%—branches, lines, functions
- Run `jest --coverage` per commit; CI fails below threshold
- Use coverage reports to identify untested code paths

### Mocks
- Use `jest.mock` for external dependencies (e.g., SDKs, AI APIs)
- Mock MCP calls in AI tests
- Create reusable mock factories for consistent test data

### Environments
- Test on testnets (e.g., Solana Devnet, Ethereum Sepolia)
- Seed DB with fixtures using Prisma seed scripts
- Use separate test databases to avoid data contamination

## TDD Cycle

### Red-Green-Refactor Pattern
1. **Red**: Write a failing test that defines the expected behavior
2. **Green**: Write the minimal code needed to make the test pass
3. **Refactor**: Clean up the code while keeping tests green

### Example TDD Flow
```typescript
// 1. RED: Write failing test
describe('calculateGains', () => {
  it('should calculate FIFO gains correctly', () => {
    const transactions = [
      { type: 'buy', amount: 10, price: 100, date: '2024-01-01' },
      { type: 'sell', amount: 5, price: 150, date: '2024-01-02' }
    ];

    const result = calculateGains(transactions, 'FIFO');

    expect(result.totalGain).toBe(250); // 5 * (150 - 100)
    expect(result.transactions).toHaveLength(2);
  });
});

// 2. GREEN: Implement minimal functionality
export function calculateGains(transactions: Transaction[], method: 'FIFO' | 'LIFO'): GainsReport {
  // Minimal implementation to pass the test
}

// 3. REFACTOR: Improve implementation while keeping tests green
```

## Specific Testing Patterns

### Unit Tests
Isolate business logic and test individual functions/methods:

```typescript
// services/costBasis.test.ts
import { calculateCostBasis } from './costBasis';

describe('Cost Basis Calculation', () => {
  describe('FIFO method', () => {
    it('should use first-in-first-out ordering', () => {
      const purchases = [
        { amount: 10, price: 100, date: '2024-01-01' },
        { amount: 10, price: 200, date: '2024-01-02' }
      ];
      const sale = { amount: 15, price: 300, date: '2024-01-03' };

      const result = calculateCostBasis(purchases, sale, 'FIFO');

      expect(result.costBasis).toBe(1500); // (10 * 100) + (5 * 200)
      expect(result.gain).toBe(3000); // (15 * 300) - 1500
    });
  });

  describe('LIFO method', () => {
    it('should use last-in-first-out ordering', () => {
      // Test LIFO logic
    });
  });

  describe('edge cases', () => {
    it('should handle insufficient purchase history', () => {
      const purchases = [{ amount: 5, price: 100, date: '2024-01-01' }];
      const sale = { amount: 10, price: 200, date: '2024-01-02' };

      expect(() => calculateCostBasis(purchases, sale, 'FIFO'))
        .toThrow('Insufficient purchase history');
    });
  });
});
```

### Integration Tests
Test API endpoints and database operations:

```typescript
// api/auth.integration.test.ts
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../utils/db';

describe('Authentication API', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /auth/register', () => {
    it('should create a new user', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'securePassword123'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        user: {
          email: userData.email,
          id: expect.any(String)
        },
        token: expect.any(String)
      });

      // Verify user was created in database
      const user = await prisma.user.findUnique({
        where: { email: userData.email }
      });
      expect(user).toBeTruthy();
    });

    it('should reject duplicate email addresses', async () => {
      // Create existing user first
      await prisma.user.create({
        data: { email: 'test@example.com', passwordHash: 'hashedPassword' }
      });

      const response = await request(app)
        .post('/auth/register')
        .send({ email: 'test@example.com', password: 'password' })
        .expect(400);

      expect(response.body.error).toContain('already exists');
    });
  });
});
```

### Blockchain Adapter Tests
Test blockchain integrations with mocks:

```typescript
// adapters/solana/SolanaAdapter.test.ts
import { Connection } from '@solana/web3.js';
import { SolanaAdapter } from './SolanaAdapter';
import { JupiterParser } from './parsers/JupiterParser';

jest.mock('@solana/web3.js');
jest.mock('./parsers/JupiterParser');

describe('SolanaAdapter', () => {
  let adapter: SolanaAdapter;
  let mockConnection: jest.Mocked<Connection>;

  beforeEach(() => {
    mockConnection = new Connection('') as jest.Mocked<Connection>;
    adapter = new SolanaAdapter(mockConnection);
  });

  describe('fetchTxns', () => {
    it('should fetch and parse Jupiter transactions', async () => {
      const mockTxns = [
        {
          signature: 'sig123',
          transaction: {
            message: {
              instructions: [{ programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' }]
            }
          }
        }
      ];

      mockConnection.getSignaturesForAddress.mockResolvedValue([{ signature: 'sig123' }]);
      mockConnection.getTransaction.mockResolvedValue(mockTxns[0]);

      const jupiterParserSpy = jest.spyOn(JupiterParser.prototype, 'parse')
        .mockReturnValue({
          type: 'swap',
          inputToken: 'SOL',
          outputToken: 'USDC',
          inputAmount: 1000000000,
          outputAmount: 100000000
        });

      const result = await adapter.fetchTxns('wallet123');

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('swap');
      expect(jupiterParserSpy).toHaveBeenCalled();
    });

    it('should handle RPC errors with retries', async () => {
      mockConnection.getSignaturesForAddress
        .mockRejectedValueOnce(new Error('RPC Error'))
        .mockResolvedValue([]);

      const result = await adapter.fetchTxns('wallet123');

      expect(result).toEqual([]);
      expect(mockConnection.getSignaturesForAddress).toHaveBeenCalledTimes(2);
    });
  });
});
```

### AI Integration Tests
Test AI features with mocked responses:

```typescript
// ai/healingService.test.ts
import { OpenAI } from 'openai';
import { HealingService } from './healingService';
import { MCPClient } from './mcp/client';

jest.mock('openai');
jest.mock('./mcp/client');

describe('HealingService', () => {
  let service: HealingService;
  let mockOpenAI: jest.Mocked<OpenAI>;
  let mockMCPClient: jest.Mocked<MCPClient>;

  beforeEach(() => {
    mockOpenAI = new OpenAI({ apiKey: 'test' }) as jest.Mocked<OpenAI>;
    mockMCPClient = new MCPClient() as jest.Mocked<MCPClient>;
    service = new HealingService(mockOpenAI, mockMCPClient);
  });

  describe('healTransaction', () => {
    it('should identify missing price and fetch from multiple sources', async () => {
      const incompleteTxn = {
        hash: 'txn123',
        token: 'BTC',
        amount: 0.1,
        date: '2024-01-01',
        priceUSD: null // Missing price
      };

      // Mock MCP tool calls for price fetching
      mockMCPClient.callTool.mockImplementation(async (toolName, params) => {
        if (toolName === 'get_price_history') {
          return { price: 45000, source: params.source };
        }
      });

      // Mock AI response
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              priceUSD: 45000,
              confidence: 0.95,
              sources: ['coingecko', 'coinmarketcap']
            })
          }
        }]
      });

      const healedTxn = await service.healTransaction(incompleteTxn);

      expect(healedTxn.priceUSD).toBe(45000);
      expect(mockMCPClient.callTool).toHaveBeenCalledWith('get_price_history', {
        tokenSymbol: 'BTC',
        date: '2024-01-01',
        source: 'coingecko'
      });
    });
  });
});
```

### Frontend Component Tests
Test React components with React Testing Library:

```typescript
// components/WalletSync.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletSync } from './WalletSync';
import { useSyncProgress } from '../hooks/useSyncProgress';

jest.mock('../hooks/useSyncProgress');

describe('WalletSync', () => {
  const mockUseSyncProgress = useSyncProgress as jest.MockedFunction<typeof useSyncProgress>;

  beforeEach(() => {
    mockUseSyncProgress.mockReturnValue({
      progress: 0,
      isLoading: false,
      error: null,
      startSync: jest.fn()
    });
  });

  it('should display sync progress', async () => {
    mockUseSyncProgress.mockReturnValue({
      progress: 50,
      isLoading: true,
      error: null,
      startSync: jest.fn()
    });

    render(<WalletSync walletAddress="wallet123" />);

    expect(screen.getByText('Syncing: 50%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50');
  });

  it('should handle sync errors', async () => {
    mockUseSyncProgress.mockReturnValue({
      progress: 0,
      isLoading: false,
      error: 'Failed to connect to RPC',
      startSync: jest.fn()
    });

    render(<WalletSync walletAddress="wallet123" />);

    expect(screen.getByText(/Failed to connect to RPC/)).toBeInTheDocument();
  });

  it('should start sync when button is clicked', async () => {
    const mockStartSync = jest.fn();
    mockUseSyncProgress.mockReturnValue({
      progress: 0,
      isLoading: false,
      error: null,
      startSync: mockStartSync
    });

    render(<WalletSync walletAddress="wallet123" />);

    fireEvent.click(screen.getByText('Start Sync'));

    await waitFor(() => {
      expect(mockStartSync).toHaveBeenCalledWith('wallet123');
    });
  });
});
```

### E2E Tests with Cypress
Test complete user flows:

```typescript
// cypress/e2e/tax-calculation.cy.ts
describe('Tax Calculation Flow', () => {
  beforeEach(() => {
    cy.login('test@example.com', 'password');
    cy.visit('/dashboard');
  });

  it('should complete full tax calculation workflow', () => {
    // Add wallet
    cy.get('[data-testid="add-wallet-btn"]').click();
    cy.get('[data-testid="wallet-address-input"]').type('wallet123');
    cy.get('[data-testid="chain-select"]').select('Solana');
    cy.get('[data-testid="save-wallet-btn"]').click();

    // Start sync
    cy.get('[data-testid="sync-wallet-btn"]').click();

    // Wait for sync to complete
    cy.get('[data-testid="sync-progress"]', { timeout: 30000 })
      .should('contain', '100%');

    // Navigate to reports
    cy.get('[data-testid="reports-nav"]').click();
    cy.get('[data-testid="generate-report-btn"]').click();

    // Verify report generation
    cy.get('[data-testid="gains-report"]').should('be.visible');
    cy.get('[data-testid="total-gains"]').should('contain', '$');

    // Export report
    cy.get('[data-testid="export-csv-btn"]').click();
    cy.readFile('cypress/downloads/tax-report.csv').should('exist');
  });

  it('should handle transaction healing workflow', () => {
    cy.visit('/dashboard');

    // Navigate to healing section
    cy.get('[data-testid="healing-nav"]').click();

    // Should show flagged transactions
    cy.get('[data-testid="flagged-transactions"]').should('be.visible');

    // Click heal button for first transaction
    cy.get('[data-testid="heal-btn"]').first().click();

    // AI should suggest fixes
    cy.get('[data-testid="ai-suggestion"]').should('be.visible');

    // Accept suggestion
    cy.get('[data-testid="accept-suggestion-btn"]').click();

    // Verify transaction is updated
    cy.get('[data-testid="transaction-status"]').should('contain', 'Healed');
  });
});
```

## Test Data Management

### Fixtures and Factories
Create reusable test data:

```typescript
// tests/factories/transaction.factory.ts
export const createMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'txn123',
  hash: 'hash123',
  walletId: 'wallet123',
  chain: 'solana',
  type: 'buy',
  tokenSymbol: 'SOL',
  amount: 1000000000,
  priceUSD: 100,
  timestamp: new Date('2024-01-01'),
  ...overrides
});

export const createMockWallet = (overrides: Partial<Wallet> = {}): Wallet => ({
  id: 'wallet123',
  address: 'Sol1234...',
  chain: 'solana',
  userId: 'user123',
  ...overrides
});
```

### Database Seeding
```typescript
// tests/setup/seedDb.ts
export async function seedTestDatabase() {
  const user = await prisma.user.create({
    data: {
      email: 'test@example.com',
      passwordHash: 'hashedPassword',
      plan: 'PRO'
    }
  });

  const wallet = await prisma.wallet.create({
    data: {
      address: 'Sol1234567890',
      chain: 'solana',
      userId: user.id
    }
  });

  await prisma.transaction.createMany({
    data: [
      createMockTransaction({ walletId: wallet.id, type: 'buy' }),
      createMockTransaction({ walletId: wallet.id, type: 'sell' })
    ]
  });

  return { user, wallet };
}
```

## Coverage and Quality Metrics

### Coverage Requirements
- **Lines**: 100%
- **Branches**: 100%
- **Functions**: 100%
- **Statements**: 100%

### Quality Gates
- All tests must pass before merge
- Coverage must not decrease
- No skipped tests in main branch
- Performance tests must pass benchmarks

### CI/CD Integration
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit -- --coverage

      - name: Run integration tests
        run: npm run test:integration

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Check coverage threshold
        run: npm run test:coverage-check

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Best Practices

### TDD Workflow
1. **Start with tests**: Never write production code without a failing test first
2. **Keep tests simple**: One assertion per test when possible
3. **Use descriptive names**: Test names should describe the behavior being tested
4. **Test edge cases**: Include boundary conditions and error scenarios

### Mock Strategy
- Mock external dependencies (APIs, databases, file systems)
- Use real implementations for internal modules when possible
- Keep mocks simple and focused
- Update mocks when external APIs change

### Test Organization
- Group related tests in describe blocks
- Use consistent naming conventions
- Keep test files close to source files
- Separate unit, integration, and E2E tests

Reference this for test writing and TDD practices. Align with `code-notes.md` for implementation patterns.