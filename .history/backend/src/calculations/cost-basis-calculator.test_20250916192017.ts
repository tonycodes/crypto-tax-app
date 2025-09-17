import { CostBasisCalculator, CostBasisMethod } from './cost-basis-calculator';
import { Transaction } from '@crypto-tax-app/shared';

describe('CostBasisCalculator', () => {
  let calculator: CostBasisCalculator;

  beforeEach(() => {
    calculator = new CostBasisCalculator();
  });

  describe('calculateCostBasis', () => {
    it('should calculate cost basis for simple buy/sell transactions', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          walletId: 'wallet1',
          hash: '0x123',
          chain: 'ethereum',
          type: 'buy',
          tokenSymbol: 'ETH',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
          priceUSD: 2000,
          timestamp: new Date('2023-01-01'),
          blockNumber: 17000000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          walletId: 'wallet1',
          hash: '0x456',
          chain: 'ethereum',
          type: 'sell',
          tokenSymbol: 'ETH',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '-0.5',
          priceUSD: 2500,
          timestamp: new Date('2023-06-01'),
          blockNumber: 17500000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const results = calculator.calculateCostBasis(transactions, {
        method: 'FIFO',
        taxYear: 2023,
      });

      expect(results).toHaveLength(1);
      expect(results[0].tokenSymbol).toBe('ETH');
      expect(results[0].totalAcquired).toBe('1');
      expect(results[0].totalDisposed).toBe('0.5');
      expect(results[0].remainingQuantity).toBe('0.5');
      expect(results[0].realizedGainLoss).toBe('250'); // (2500 - 2000) * 0.5
      expect(results[0].costBasis).toBe('1000'); // 2000 * 0.5 remaining
    });

    it('should handle multiple tokens separately', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          walletId: 'wallet1',
          hash: '0x123',
          chain: 'ethereum',
          type: 'buy',
          tokenSymbol: 'ETH',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
          priceUSD: 2000,
          timestamp: new Date('2023-01-01'),
          blockNumber: 17000000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          walletId: 'wallet1',
          hash: '0x456',
          chain: 'ethereum',
          type: 'buy',
          tokenSymbol: 'USDC',
          tokenAddress: '0xa0b86a33e6c7c5b5e7e7e7e7e7e7e7e7e7e7e7e7e7',
          amount: '1000.0',
          priceUSD: 1,
          timestamp: new Date('2023-01-01'),
          blockNumber: 17000000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const results = calculator.calculateCostBasis(transactions, {
        method: 'FIFO',
        taxYear: 2023,
      });

      expect(results).toHaveLength(2);
      const ethResult = results.find(r => r.tokenSymbol === 'ETH');
      const usdcResult = results.find(r => r.tokenSymbol === 'USDC');

      expect(ethResult?.totalAcquired).toBe('1');
      expect(usdcResult?.totalAcquired).toBe('1000');
    });

    it('should handle LIFO method correctly', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          walletId: 'wallet1',
          hash: '0x123',
          chain: 'ethereum',
          type: 'buy',
          tokenSymbol: 'ETH',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
          priceUSD: 1000,
          timestamp: new Date('2023-01-01'),
          blockNumber: 17000000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          walletId: 'wallet1',
          hash: '0x456',
          chain: 'ethereum',
          type: 'buy',
          tokenSymbol: 'ETH',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
          priceUSD: 2000,
          timestamp: new Date('2023-02-01'),
          blockNumber: 17100000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          walletId: 'wallet1',
          hash: '0x789',
          chain: 'ethereum',
          type: 'sell',
          tokenSymbol: 'ETH',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '-1.0',
          priceUSD: 1500,
          timestamp: new Date('2023-03-01'),
          blockNumber: 17200000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const results = calculator.calculateCostBasis(transactions, {
        method: 'LIFO',
        taxYear: 2023,
      });

      expect(results).toHaveLength(1);
      // LIFO should sell the most recent purchase first (2000), resulting in loss
      expect(results[0].realizedGainLoss).toBe('-500'); // (1500 - 2000) * 1
      expect(results[0].remainingQuantity).toBe('1'); // 1 ETH remaining at 1000 cost basis
      expect(results[0].costBasis).toBe('1000');
    });
  });

  describe('sortAcquisitions', () => {
    it('should sort FIFO by oldest first', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          walletId: 'wallet1',
          hash: '0x123',
          chain: 'ethereum',
          type: 'buy',
          tokenSymbol: 'ETH',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
          priceUSD: 1000,
          timestamp: new Date('2023-02-01'),
          blockNumber: 17000000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          walletId: 'wallet1',
          hash: '0x456',
          chain: 'ethereum',
          type: 'buy',
          tokenSymbol: 'ETH',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
          priceUSD: 2000,
          timestamp: new Date('2023-01-01'),
          blockNumber: 16900000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const sorted = (calculator as any).sortAcquisitions(transactions, 'FIFO');

      expect(sorted[0].timestamp.getTime()).toBeLessThan(sorted[1].timestamp.getTime());
    });

    it('should sort LIFO by newest first', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          walletId: 'wallet1',
          hash: '0x123',
          chain: 'ethereum',
          type: 'buy',
          tokenSymbol: 'ETH',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
          priceUSD: 1000,
          timestamp: new Date('2023-01-01'),
          blockNumber: 16900000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          walletId: 'wallet1',
          hash: '0x456',
          chain: 'ethereum',
          type: 'buy',
          tokenSymbol: 'ETH',
          tokenAddress: '0x0000000000000000000000000000000000000000',
          amount: '1.0',
          priceUSD: 2000,
          timestamp: new Date('2023-02-01'),
          blockNumber: 17000000,
          isHealed: false,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const sorted = (calculator as any).sortAcquisitions(transactions, 'LIFO');

      expect(sorted[0].timestamp.getTime()).toBeGreaterThan(sorted[1].timestamp.getTime());
    });
  });
});
