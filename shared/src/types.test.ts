import {
  UserSchema,
  WalletSchema,
  TransactionSchema,
  PlanSchema,
  ChainType,
  TransactionType,
  CalculationMethod,
} from './types';

describe('Schema Validation', () => {
  describe('UserSchema', () => {
    it('should validate a valid user object', () => {
      const validUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        plan: 'PRO' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = UserSchema.safeParse(validUser);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const invalidUser = {
        id: 'user-123',
        email: 'invalid-email',
        passwordHash: 'hashed-password',
        plan: 'PRO' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = UserSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });

    it('should reject invalid plan type', () => {
      const invalidUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        plan: 'INVALID_PLAN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = UserSchema.safeParse(invalidUser);
      expect(result.success).toBe(false);
    });
  });

  describe('WalletSchema', () => {
    it('should validate a valid Solana wallet', () => {
      const validWallet = {
        id: 'wallet-123',
        userId: 'user-123',
        address: 'So11111111111111111111111111111111111111112',
        chain: 'solana' as ChainType,
        label: 'My Solana Wallet',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = WalletSchema.safeParse(validWallet);
      expect(result.success).toBe(true);
    });

    it('should validate a valid Ethereum wallet', () => {
      const validWallet = {
        id: 'wallet-123',
        userId: 'user-123',
        address: '0x742d35Cc6634C0532925a3b8D82C5b6f47741c52',
        chain: 'ethereum' as ChainType,
        label: 'My ETH Wallet',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = WalletSchema.safeParse(validWallet);
      expect(result.success).toBe(true);
    });

    it('should reject invalid chain type', () => {
      const invalidWallet = {
        id: 'wallet-123',
        userId: 'user-123',
        address: 'valid-address',
        chain: 'invalid-chain',
        label: 'My Wallet',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = WalletSchema.safeParse(invalidWallet);
      expect(result.success).toBe(false);
    });
  });

  describe('TransactionSchema', () => {
    it('should validate a valid buy transaction', () => {
      const validTransaction = {
        id: 'txn-123',
        walletId: 'wallet-123',
        hash: '0x1234567890abcdef',
        chain: 'ethereum' as ChainType,
        type: 'buy' as TransactionType,
        tokenSymbol: 'ETH',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        amount: '1000000000000000000', // 1 ETH in wei
        priceUSD: 2000.50,
        feeAmount: '21000000000000000', // Gas fee in wei
        feeTokenSymbol: 'ETH',
        timestamp: new Date(),
        blockNumber: 18500000,
        isHealed: false,
        healingConfidence: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = TransactionSchema.safeParse(validTransaction);
      expect(result.success).toBe(true);
    });

    it('should validate a healed transaction with confidence score', () => {
      const healedTransaction = {
        id: 'txn-123',
        walletId: 'wallet-123',
        hash: 'signature123',
        chain: 'solana' as ChainType,
        type: 'sell' as TransactionType,
        tokenSymbol: 'SOL',
        tokenAddress: 'So11111111111111111111111111111111111111112',
        amount: '1000000000', // 1 SOL in lamports
        priceUSD: 100.25,
        feeAmount: '5000', // SOL fee in lamports
        feeTokenSymbol: 'SOL',
        timestamp: new Date(),
        blockNumber: 200000000,
        isHealed: true,
        healingConfidence: 0.95,
        metadata: { source: 'jupiter', route: 'SOL-USDC' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = TransactionSchema.safeParse(healedTransaction);
      expect(result.success).toBe(true);
    });

    it('should reject transaction with invalid confidence score', () => {
      const invalidTransaction = {
        id: 'txn-123',
        walletId: 'wallet-123',
        hash: 'signature123',
        chain: 'solana' as ChainType,
        type: 'sell' as TransactionType,
        tokenSymbol: 'SOL',
        amount: '1000000000',
        priceUSD: 100.25,
        timestamp: new Date(),
        isHealed: true,
        healingConfidence: 1.5, // Invalid: > 1
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = TransactionSchema.safeParse(invalidTransaction);
      expect(result.success).toBe(false);
    });
  });

  describe('PlanSchema', () => {
    it('should validate BASIC plan', () => {
      const basicPlan = {
        id: 'plan-basic',
        name: 'BASIC',
        monthlyPriceUSD: 0,
        features: ['1_chain', 'basic_reports'],
        chainLimit: 1,
        transactionLimit: 1000,
        hasAIHealing: false,
        hasAdvancedReports: false,
        isActive: true,
      };

      const result = PlanSchema.safeParse(basicPlan);
      expect(result.success).toBe(true);
    });

    it('should validate PRO plan with all features', () => {
      const proPlan = {
        id: 'plan-pro',
        name: 'PRO',
        monthlyPriceUSD: 50,
        features: ['unlimited_chains', 'ai_healing', 'advanced_reports'],
        chainLimit: null,
        transactionLimit: null,
        hasAIHealing: true,
        hasAdvancedReports: true,
        isActive: true,
      };

      const result = PlanSchema.safeParse(proPlan);
      expect(result.success).toBe(true);
    });
  });

  describe('Enum Types', () => {
    it('should validate ChainType enum values', () => {
      const validChains: ChainType[] = ['ethereum', 'solana', 'bitcoin', 'sui'];
      validChains.forEach(chain => {
        expect(['ethereum', 'solana', 'bitcoin', 'sui']).toContain(chain);
      });
    });

    it('should validate TransactionType enum values', () => {
      const validTypes: TransactionType[] = ['buy', 'sell', 'swap', 'transfer', 'airdrop', 'reward', 'fee'];
      validTypes.forEach(type => {
        expect(['buy', 'sell', 'swap', 'transfer', 'airdrop', 'reward', 'fee']).toContain(type);
      });
    });

    it('should validate CalculationMethod enum values', () => {
      const validMethods: CalculationMethod[] = ['FIFO', 'LIFO'];
      validMethods.forEach(method => {
        expect(['FIFO', 'LIFO']).toContain(method);
      });
    });
  });
});