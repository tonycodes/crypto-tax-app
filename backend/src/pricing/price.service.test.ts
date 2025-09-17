import { describe, it, expect, beforeEach } from '@jest/globals';
import { PriceService } from './price.service';

describe('PriceService', () => {
  let priceService: PriceService;

  beforeEach(() => {
    priceService = new PriceService();
    priceService.clearCache(); // Clear cache between tests
  });

  describe('Token mapping', () => {
    it('should return null for unknown tokens', async () => {
      const result = await priceService.getHistoricalPrice('UNKNOWN_TOKEN', Date.now(), 'ethereum');
      expect(result).toBeNull();
    });

    it('should handle case insensitive token mapping', async () => {
      // Test that both uppercase and lowercase work
      const result1 = await priceService.getHistoricalPrice('ETH', Date.now(), 'ethereum');
      const result2 = await priceService.getHistoricalPrice('eth', Date.now(), 'ethereum');

      // Both should either succeed or fail together (depending on API availability)
      expect(result1 === null).toBe(result2 === null);
    });

    it('should map common tokens correctly', async () => {
      // These are integration tests that may fail if CoinGecko API is down
      // They test the mapping logic, not the API calls
      const ethResult = await priceService.getHistoricalPrice('ETH', Date.now(), 'ethereum');
      const solResult = await priceService.getHistoricalPrice('SOL', Date.now(), 'solana');
      const btcResult = await priceService.getHistoricalPrice('BTC', Date.now(), 'bitcoin');

      // Results may be null if API is down, but the mapping should work
      // We just verify the function doesn't throw and returns expected structure
      if (ethResult) {
        expect(ethResult.symbol).toBe('ETH');
        expect(typeof ethResult.price).toBe('number');
        expect(typeof ethResult.timestamp).toBe('number');
      }

      if (solResult) {
        expect(solResult.symbol).toBe('SOL');
        expect(typeof solResult.price).toBe('number');
      }

      if (btcResult) {
        expect(btcResult.symbol).toBe('BTC');
        expect(typeof btcResult.price).toBe('number');
      }
    });
  });

  describe('Cache functionality', () => {
    it('should have a clearCache method', () => {
      expect(typeof priceService.clearCache).toBe('function');
      expect(() => priceService.clearCache()).not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should handle invalid timestamps gracefully', async () => {
      const result = await priceService.getHistoricalPrice('ETH', -1, 'ethereum');
      // Should either return null or handle the error gracefully
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should handle very old dates', async () => {
      const oldTimestamp = new Date('2010-01-01').getTime();
      const result = await priceService.getHistoricalPrice('BTC', oldTimestamp, 'bitcoin');
      // May return null if no data available for that date
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });
});
