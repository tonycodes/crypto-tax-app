import { PrismaClient } from '@prisma/client';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

describe('Database Schema Tests', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env['DATABASE_URL'] || 'postgresql://test:test@localhost:5432/crypto_tax_test',
        },
      },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prisma.transaction.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.paymentInvoice.deleteMany();
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.transaction.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
    await prisma.plan.deleteMany();
    await prisma.paymentInvoice.deleteMany();
  });

  describe('Plan Model', () => {
    it('should create a plan with all required fields', async () => {
      const planData = {
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

      const plan = await prisma.plan.create({
        data: planData,
      });

      expect(plan.id).toBe(planData.id);
      expect(plan.name).toBe(planData.name);
      expect(plan.monthlyPriceUSD).toBe(planData.monthlyPriceUSD);
      expect(plan.features).toEqual(planData.features);
      expect(plan.chainLimit).toBe(planData.chainLimit);
      expect(plan.hasAIHealing).toBe(false);
      expect(plan.createdAt).toBeInstanceOf(Date);
      expect(plan.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a PRO plan with unlimited limits', async () => {
      const proPlanData = {
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

      const plan = await prisma.plan.create({
        data: proPlanData,
      });

      expect(plan.chainLimit).toBeNull();
      expect(plan.transactionLimit).toBeNull();
      expect(plan.hasAIHealing).toBe(true);
      expect(plan.hasAdvancedReports).toBe(true);
    });
  });

  describe('User Model', () => {
    it('should create a user with all required fields', async () => {
      // First create a plan
      const plan = await prisma.plan.create({
        data: {
          id: 'plan-basic',
          name: 'BASIC',
          monthlyPriceUSD: 0,
          features: ['1_chain'],
          isActive: true,
        },
      });

      const userData = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        planId: plan.id,
        twoFactorEnabled: false,
      };

      const user = await prisma.user.create({
        data: userData,
        include: {
          plan: true,
        },
      });

      expect(user.id).toBe(userData.id);
      expect(user.email).toBe(userData.email);
      expect(user.passwordHash).toBe(userData.passwordHash);
      expect(user.planId).toBe(plan.id);
      expect(user.plan.name).toBe('BASIC');
      expect(user.twoFactorEnabled).toBe(false);
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it('should enforce unique email constraint', async () => {
      const plan = await prisma.plan.create({
        data: {
          id: 'plan-basic',
          name: 'BASIC',
          monthlyPriceUSD: 0,
          features: ['1_chain'],
          isActive: true,
        },
      });

      const userData = {
        email: 'duplicate@example.com',
        passwordHash: 'hashed-password',
        planId: plan.id,
      };

      // Create first user
      await prisma.user.create({
        data: {
          id: 'user-1',
          ...userData,
        },
      });

      // Try to create second user with same email
      await expect(
        prisma.user.create({
          data: {
            id: 'user-2',
            ...userData,
          },
        })
      ).rejects.toThrow();
    });
  });

  describe('Wallet Model', () => {
    let user: any;

    beforeEach(async () => {
      const plan = await prisma.plan.create({
        data: {
          id: 'plan-basic',
          name: 'BASIC',
          monthlyPriceUSD: 0,
          features: ['1_chain'],
          isActive: true,
        },
      });

      user = await prisma.user.create({
        data: {
          id: 'user-123',
          email: 'test@example.com',
          passwordHash: 'hashed-password',
          planId: plan.id,
        },
      });
    });

    it('should create a wallet with encrypted address', async () => {
      const walletData = {
        id: 'wallet-123',
        userId: user.id,
        address: 'So11111111111111111111111111111111111111112', // This would be encrypted
        chain: 'solana',
        label: 'My Solana Wallet',
        isActive: true,
      };

      const wallet = await prisma.wallet.create({
        data: walletData,
        include: {
          user: true,
        },
      });

      expect(wallet.id).toBe(walletData.id);
      expect(wallet.userId).toBe(user.id);
      expect(wallet.address).toBe(walletData.address);
      expect(wallet.chain).toBe(walletData.chain);
      expect(wallet.label).toBe(walletData.label);
      expect(wallet.isActive).toBe(true);
      expect(wallet.user.email).toBe(user.email);
    });

    it('should allow multiple wallets per user', async () => {
      await prisma.wallet.create({
        data: {
          id: 'wallet-1',
          userId: user.id,
          address: 'So11111111111111111111111111111111111111112',
          chain: 'solana',
        },
      });

      await prisma.wallet.create({
        data: {
          id: 'wallet-2',
          userId: user.id,
          address: '0x742d35Cc6634C0532925a3b8D82C5b6f47741c52',
          chain: 'ethereum',
        },
      });

      const userWithWallets = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          wallets: true,
        },
      });

      expect(userWithWallets?.wallets).toHaveLength(2);
      expect(userWithWallets?.wallets.map(w => w.chain)).toEqual(
        expect.arrayContaining(['solana', 'ethereum'])
      );
    });
  });

  describe('Transaction Model', () => {
    let wallet: any;

    beforeEach(async () => {
      const plan = await prisma.plan.create({
        data: {
          id: 'plan-basic',
          name: 'BASIC',
          monthlyPriceUSD: 0,
          features: ['1_chain'],
          isActive: true,
        },
      });

      const user = await prisma.user.create({
        data: {
          id: 'user-123',
          email: 'test@example.com',
          passwordHash: 'hashed-password',
          planId: plan.id,
        },
      });

      wallet = await prisma.wallet.create({
        data: {
          id: 'wallet-123',
          userId: user.id,
          address: 'So11111111111111111111111111111111111111112',
          chain: 'solana',
        },
      });
    });

    it('should create a transaction with all required fields', async () => {
      const txnData = {
        id: 'txn-123',
        walletId: wallet.id,
        hash: 'signature123',
        chain: 'solana',
        type: 'buy',
        tokenSymbol: 'SOL',
        tokenAddress: 'So11111111111111111111111111111111111111112',
        amount: '1000000000', // 1 SOL in lamports
        priceUSD: 100.25,
        feeAmount: '5000',
        feeTokenSymbol: 'SOL',
        timestamp: new Date('2024-01-01T12:00:00Z'),
        blockNumber: 200000000,
        isHealed: false,
        metadata: { source: 'rpc' },
      };

      const transaction = await prisma.transaction.create({
        data: txnData,
        include: {
          wallet: {
            include: {
              user: true,
            },
          },
        },
      });

      expect(transaction.id).toBe(txnData.id);
      expect(transaction.hash).toBe(txnData.hash);
      expect(transaction.chain).toBe(txnData.chain);
      expect(transaction.type).toBe(txnData.type);
      expect(transaction.amount).toBe(txnData.amount);
      expect(transaction.priceUSD).toBe(txnData.priceUSD);
      expect(transaction.isHealed).toBe(false);
      expect(transaction.healingConfidence).toBeNull();
      expect(transaction.metadata).toEqual(txnData.metadata);
      expect(transaction.wallet.chain).toBe('solana');
    });

    it('should create a healed transaction with confidence score', async () => {
      const healedTxnData = {
        id: 'txn-healed-123',
        walletId: wallet.id,
        hash: 'signature456',
        chain: 'solana',
        type: 'sell',
        tokenSymbol: 'SOL',
        amount: '500000000',
        priceUSD: 95.50,
        timestamp: new Date('2024-01-02T12:00:00Z'),
        isHealed: true,
        healingConfidence: 0.95,
        metadata: { source: 'ai_healed', originalPrice: null },
      };

      const transaction = await prisma.transaction.create({
        data: healedTxnData,
      });

      expect(transaction.isHealed).toBe(true);
      expect(transaction.healingConfidence).toBe(0.95);
      expect(transaction.metadata).toEqual(healedTxnData.metadata);
    });
  });

  describe('PaymentInvoice Model', () => {
    it('should create a payment invoice for subscription', async () => {
      const invoiceData = {
        id: 'invoice-123',
        planType: 'PRO',
        cryptocurrency: 'SOL',
        amount: '0.5',
        address: 'payment-address-123',
        qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        status: 'pending',
      };

      const invoice = await prisma.paymentInvoice.create({
        data: invoiceData,
      });

      expect(invoice.id).toBe(invoiceData.id);
      expect(invoice.planType).toBe(invoiceData.planType);
      expect(invoice.cryptocurrency).toBe(invoiceData.cryptocurrency);
      expect(invoice.amount).toBe(invoiceData.amount);
      expect(invoice.status).toBe('pending');
      expect(invoice.expiresAt).toBeInstanceOf(Date);
    });
  });
});