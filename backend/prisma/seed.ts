import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create subscription plans
  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { id: 'basic' },
      update: {},
      create: {
        id: 'basic',
        name: 'BASIC',
        monthlyPriceUSD: 0,
        features: ['1 blockchain', 'Basic tax reports', '1,000 transactions/month', 'CSV export'],
        chainLimit: 1,
        transactionLimit: 1000,
        hasAIHealing: false,
        hasAdvancedReports: false,
      },
    }),
    prisma.plan.upsert({
      where: { id: 'pro' },
      update: {},
      create: {
        id: 'pro',
        name: 'PRO',
        monthlyPriceUSD: 50,
        features: [
          'All blockchains',
          'AI-powered transaction healing',
          'Advanced tax reports',
          'Unlimited transactions',
          'CSV & PDF export',
          'Historical price data',
          'DeFi transaction parsing',
        ],
        chainLimit: null, // unlimited
        transactionLimit: null, // unlimited
        hasAIHealing: true,
        hasAdvancedReports: true,
      },
    }),
    prisma.plan.upsert({
      where: { id: 'enterprise' },
      update: {},
      create: {
        id: 'enterprise',
        name: 'ENTERPRISE',
        monthlyPriceUSD: 200,
        features: [
          'All PRO features',
          'Priority support',
          'Custom integrations',
          'API access',
          'Multi-user support',
          'Audit trail',
          'Custom reports',
          'Dedicated account manager',
        ],
        chainLimit: null, // unlimited
        transactionLimit: null, // unlimited
        hasAIHealing: true,
        hasAdvancedReports: true,
      },
    }),
  ]);

  console.log('✅ Seeded subscription plans:', plans.map(p => p.name).join(', '));

  // In development, create a test user
  if (process.env.NODE_ENV === 'development') {
    const testUser = await prisma.user.upsert({
      where: { email: 'test@example.com' },
      update: {},
      create: {
        id: 'test-user-1',
        email: 'test@example.com',
        passwordHash: '$2b$10$K7L1OJ0TfJHopNBol1JX6uN3dHU8cXHjn/3LW0kfYXvgcCVv2y8Hy', // "password123"
        planId: 'basic',
      },
    });

    console.log('✅ Created test user:', testUser.email);
  }
}

main()
  .catch(e => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
