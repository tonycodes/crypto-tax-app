import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

describe('Database Models', () => {
  beforeAll(async () => {
    // Ensure database is connected
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up and disconnect
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up test data between tests
    await prisma.transaction.deleteMany({});
    await prisma.wallet.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.paymentInvoice.deleteMany({});
    await prisma.costBasisEntry.deleteMany({});
    await prisma.taxReport.deleteMany({});
  });

  describe('Plan Model', () => {
    it('should create a subscription plan', async () => {
      const plan = await prisma.plan.create({
        data: {
          id: 'pro',
          name: 'PRO',
          monthlyPriceUSD: 50,
          features: ['All chains', 'AI healing', 'Advanced reports'],
          chainLimit: null, // unlimited
          transactionLimit: null, // unlimited
          hasAIHealing: true,
          hasAdvancedReports: true,
        },
      });

      expect(plan.id).toBe('pro');
      expect(plan.name).toBe('PRO');
      expect(plan.monthlyPriceUSD).toBe(50);
      expect(plan.features).toEqual(['All chains', 'AI healing', 'Advanced reports']);
      expect(plan.hasAIHealing).toBe(true);
    });

    it('should create all three subscription tiers', async () => {
      const plans = await Promise.all([
        prisma.plan.create({
          data: {
            id: 'basic',
            name: 'BASIC',
            monthlyPriceUSD: 0,
            features: ['1 chain', 'Basic reports'],
            chainLimit: 1,
            transactionLimit: 1000,
            hasAIHealing: false,
            hasAdvancedReports: false,
          },
        }),
        prisma.plan.create({
          data: {
            id: 'pro',
            name: 'PRO',
            monthlyPriceUSD: 50,
            features: ['All chains', 'AI healing', 'Advanced reports'],
            chainLimit: null,
            transactionLimit: null,
            hasAIHealing: true,
            hasAdvancedReports: true,
          },
        }),
        prisma.plan.create({
          data: {
            id: 'enterprise',
            name: 'ENTERPRISE',
            monthlyPriceUSD: 200,
            features: [
              'All chains',
              'AI healing',
              'Advanced reports',
              'Priority support',
              'Custom features',
            ],
            chainLimit: null,
            transactionLimit: null,
            hasAIHealing: true,
            hasAdvancedReports: true,
          },
        }),
      ]);

      expect(plans).toHaveLength(3);
      expect(plans.map(p => p.name)).toEqual(['BASIC', 'PRO', 'ENTERPRISE']);
    });
  });

  describe('User Model', () => {
    let basicPlan: any;

    beforeEach(async () => {
      basicPlan = await prisma.plan.create({
        data: {
          id: 'basic',
          name: 'BASIC',
          monthlyPriceUSD: 0,
          features: ['1 chain', 'Basic reports'],
          chainLimit: 1,
          transactionLimit: 1000,
        },
      });
    });

    it('should create a user with a plan', async () => {
      const user = await prisma.user.create({
        data: {
          id: uuidv4(),
          email: 'test@example.com',
          passwordHash: 'hashed_password_123',
          planId: basicPlan.id,
        },
        include: {
          plan: true,
        },
      });

      expect(user.email).toBe('test@example.com');
      expect(user.passwordHash).toBe('hashed_password_123');
      expect(user.plan.name).toBe('BASIC');
      expect(user.twoFactorEnabled).toBe(false);
    });

    it('should enforce unique email constraint', async () => {
      await prisma.user.create({
        data: {
          id: uuidv4(),
          email: 'duplicate@example.com',
          passwordHash: 'hash1',
          planId: basicPlan.id,
        },
      });

      await expect(
        prisma.user.create({
          data: {
            id: uuidv4(),
            email: 'duplicate@example.com',
            passwordHash: 'hash2',
            planId: basicPlan.id,
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
          id: 'basic',
          name: 'BASIC',
          monthlyPriceUSD: 0,
          features: [],
          chainLimit: 1,
        },
      });

      user = await prisma.user.create({
        data: {
          id: uuidv4(),
          email: 'wallet-test@example.com',
          passwordHash: 'hash',
          planId: plan.id,
        },
      });
    });

    it('should create a wallet for a user', async () => {
      const wallet = await prisma.wallet.create({
        data: {
          id: uuidv4(),
          userId: user.id,
          address: 'encrypted_0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1',
          chain: 'ethereum',
          label: 'My Main Wallet',
        },
      });

      expect(wallet.userId).toBe(user.id);
      expect(wallet.address).toContain('encrypted_');
      expect(wallet.chain).toBe('ethereum');
      expect(wallet.isActive).toBe(true);
    });

    it('should support multiple chains', async () => {
      const chains = ['ethereum', 'solana', 'bitcoin', 'sui'];
      const wallets = await Promise.all(
        chains.map(chain =>
          prisma.wallet.create({
            data: {
              id: uuidv4(),
              userId: user.id,
              address: `encrypted_${chain}_address`,
              chain,
            },
          })
        )
      );

      expect(wallets).toHaveLength(4);
      expect(wallets.map(w => w.chain)).toEqual(chains);
    });

    it('should cascade delete wallets when user is deleted', async () => {
      const wallet = await prisma.wallet.create({
        data: {
          id: uuidv4(),
          userId: user.id,
          address: 'encrypted_address',
          chain: 'ethereum',
        },
      });

      await prisma.user.delete({ where: { id: user.id } });

      const foundWallet = await prisma.wallet.findUnique({
        where: { id: wallet.id },
      });

      expect(foundWallet).toBeNull();
    });
  });

  describe('Transaction Model', () => {
    let wallet: any;

    beforeEach(async () => {
      const plan = await prisma.plan.create({
        data: {
          id: 'basic',
          name: 'BASIC',
          monthlyPriceUSD: 0,
          features: [],
        },
      });

      const user = await prisma.user.create({
        data: {
          id: uuidv4(),
          email: 'tx-test@example.com',
          passwordHash: 'hash',
          planId: plan.id,
        },
      });

      wallet = await prisma.wallet.create({
        data: {
          id: uuidv4(),
          userId: user.id,
          address: 'encrypted_address',
          chain: 'ethereum',
        },
      });
    });

    it('should create a transaction', async () => {
      const tx = await prisma.transaction.create({
        data: {
          id: uuidv4(),
          walletId: wallet.id,
          hash: '0x123abc',
          chain: 'ethereum',
          type: 'swap',
          tokenSymbol: 'ETH',
          amount: '1000000000000000000', // 1 ETH in wei
          priceUSD: 2000,
          feeAmount: '21000000000000', // Gas fee
          feeTokenSymbol: 'ETH',
          timestamp: new Date('2024-01-01'),
          blockNumber: 18000000,
        },
      });

      expect(tx.walletId).toBe(wallet.id);
      expect(tx.hash).toBe('0x123abc');
      expect(tx.type).toBe('swap');
      expect(tx.amount).toBe('1000000000000000000');
      expect(tx.priceUSD).toBe(2000);
      expect(tx.isHealed).toBe(false);
    });

    it('should support different transaction types', async () => {
      const types = ['buy', 'sell', 'swap', 'transfer', 'airdrop', 'reward', 'fee'];
      const txs = await Promise.all(
        types.map(type =>
          prisma.transaction.create({
            data: {
              id: uuidv4(),
              walletId: wallet.id,
              hash: `hash_${type}`,
              chain: 'ethereum',
              type,
              tokenSymbol: 'ETH',
              amount: '1000000000000000000',
              timestamp: new Date(),
            },
          })
        )
      );

      expect(txs).toHaveLength(7);
      expect(txs.map(tx => tx.type)).toEqual(types);
    });

    it('should store metadata as JSON', async () => {
      const metadata = {
        from: '0xabc',
        to: '0xdef',
        gasUsed: '21000',
        programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
      };

      const tx = await prisma.transaction.create({
        data: {
          id: uuidv4(),
          walletId: wallet.id,
          hash: '0x456',
          chain: 'solana',
          type: 'swap',
          tokenSymbol: 'SOL',
          amount: '1000000000', // 1 SOL in lamports
          timestamp: new Date(),
          metadata,
        },
      });

      expect(tx.metadata).toEqual(metadata);
    });
  });

  describe('PaymentInvoice Model', () => {
    it('should create a payment invoice for crypto subscription', async () => {
      const invoice = await prisma.paymentInvoice.create({
        data: {
          id: uuidv4(),
          planType: 'PRO',
          cryptocurrency: 'SOL',
          amount: '25', // 25 SOL for $50 at $2/SOL
          address: 'SoLaNaAddReSs123456789',
          qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        },
      });

      expect(invoice.planType).toBe('PRO');
      expect(invoice.cryptocurrency).toBe('SOL');
      expect(invoice.amount).toBe('25');
      expect(invoice.status).toBe('pending');
    });

    it('should support multiple cryptocurrencies', async () => {
      const invoices = await Promise.all([
        prisma.paymentInvoice.create({
          data: {
            id: uuidv4(),
            planType: 'PRO',
            cryptocurrency: 'SOL',
            amount: '25',
            address: 'sol_address',
            qrCode: 'qr1',
            expiresAt: new Date(Date.now() + 3600000),
          },
        }),
        prisma.paymentInvoice.create({
          data: {
            id: uuidv4(),
            planType: 'ENTERPRISE',
            cryptocurrency: 'BTC',
            amount: '0.005', // 0.005 BTC for $200 at $40k/BTC
            address: 'btc_address',
            qrCode: 'qr2',
            expiresAt: new Date(Date.now() + 3600000),
          },
        }),
      ]);

      expect(invoices).toHaveLength(2);
      expect(invoices.map(i => i.cryptocurrency)).toEqual(['SOL', 'BTC']);
    });
  });

  describe('CostBasisEntry Model', () => {
    it('should create cost basis entries for tax calculations', async () => {
      const entry = await prisma.costBasisEntry.create({
        data: {
          id: uuidv4(),
          userId: uuidv4(),
          transactionId: uuidv4(),
          tokenSymbol: 'ETH',
          amount: '1000000000000000000', // 1 ETH
          costBasisUSD: 1500,
          acquisitionDate: new Date('2024-01-01'),
          method: 'FIFO',
          taxYear: 2024,
        },
      });

      expect(entry.tokenSymbol).toBe('ETH');
      expect(entry.costBasisUSD).toBe(1500);
      expect(entry.method).toBe('FIFO');
      expect(entry.isDisposed).toBe(false);
    });

    it('should track disposal of assets', async () => {
      const buyTxId = uuidv4();
      const sellTxId = uuidv4();

      const entry = await prisma.costBasisEntry.create({
        data: {
          id: uuidv4(),
          userId: uuidv4(),
          transactionId: buyTxId,
          tokenSymbol: 'BTC',
          amount: '100000000', // 1 BTC in satoshis
          costBasisUSD: 30000,
          acquisitionDate: new Date('2024-01-01'),
          method: 'FIFO',
          taxYear: 2024,
          isDisposed: true,
          disposalTxnId: sellTxId,
        },
      });

      expect(entry.isDisposed).toBe(true);
      expect(entry.disposalTxnId).toBe(sellTxId);
    });
  });

  describe('TaxReport Model', () => {
    it('should create a tax report', async () => {
      const reportData = {
        transactions: [],
        costBasisMethod: 'FIFO',
        generatedAt: new Date().toISOString(),
      };

      const report = await prisma.taxReport.create({
        data: {
          id: uuidv4(),
          userId: uuidv4(),
          taxYear: 2024,
          method: 'FIFO',
          totalGainUSD: 10000,
          totalLossUSD: 2000,
          netGainLossUSD: 8000,
          reportData,
        },
      });

      expect(report.taxYear).toBe(2024);
      expect(report.method).toBe('FIFO');
      expect(report.netGainLossUSD).toBe(8000);
      expect(report.reportData).toEqual(reportData);
    });

    it('should support multiple tax years', async () => {
      const userId = uuidv4();
      const reports = await Promise.all([
        prisma.taxReport.create({
          data: {
            id: uuidv4(),
            userId,
            taxYear: 2023,
            method: 'FIFO',
            totalGainUSD: 5000,
            totalLossUSD: 1000,
            netGainLossUSD: 4000,
            reportData: {},
          },
        }),
        prisma.taxReport.create({
          data: {
            id: uuidv4(),
            userId,
            taxYear: 2024,
            method: 'FIFO',
            totalGainUSD: 10000,
            totalLossUSD: 2000,
            netGainLossUSD: 8000,
            reportData: {},
          },
        }),
      ]);

      expect(reports).toHaveLength(2);
      expect(reports.map(r => r.taxYear)).toEqual([2023, 2024]);
    });
  });
});
