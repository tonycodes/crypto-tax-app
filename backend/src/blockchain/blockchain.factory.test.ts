import { describe, it, expect } from '@jest/globals';
import { BlockchainAdapterFactory } from './blockchain.factory';
import { ChainType } from './adapters/adapter.interface';
import { EthereumAdapter } from './adapters/ethereum.adapter';
import { SolanaAdapter } from './adapters/solana.adapter';
import { BitcoinAdapter } from './adapters/bitcoin.adapter';

describe('BlockchainAdapterFactory', () => {
  let factory: BlockchainAdapterFactory;

  beforeEach(() => {
    factory = new BlockchainAdapterFactory();
  });

  describe('createAdapter', () => {
    it('should create Ethereum adapter for ETHEREUM chain', () => {
      const adapter = factory.createAdapter(ChainType.ETHEREUM);
      expect(adapter).toBeInstanceOf(EthereumAdapter);
      expect(adapter.chain).toBe(ChainType.ETHEREUM);
    });

    it('should create Solana adapter for SOLANA chain', () => {
      const adapter = factory.createAdapter(ChainType.SOLANA);
      expect(adapter).toBeInstanceOf(SolanaAdapter);
      expect(adapter.chain).toBe(ChainType.SOLANA);
    });

    it('should create Bitcoin adapter for BITCOIN chain', () => {
      const adapter = factory.createAdapter(ChainType.BITCOIN);
      expect(adapter).toBeInstanceOf(BitcoinAdapter);
      expect(adapter.chain).toBe(ChainType.BITCOIN);
    });

    it('should throw error for unsupported chain', () => {
      expect(() => factory.createAdapter('UNSUPPORTED' as ChainType)).toThrow(
        'Unsupported blockchain: UNSUPPORTED'
      );
    });
  });

  describe('getSupportedChains', () => {
    it('should return list of supported chains', () => {
      const chains = factory.getSupportedChains();
      expect(chains).toContain(ChainType.ETHEREUM);
      expect(chains).toContain(ChainType.SOLANA);
      expect(chains).toContain(ChainType.BITCOIN);
      expect(chains).toHaveLength(3);
    });
  });

  describe('isChainSupported', () => {
    it('should return true for supported chains', () => {
      expect(factory.isChainSupported(ChainType.ETHEREUM)).toBe(true);
      expect(factory.isChainSupported(ChainType.SOLANA)).toBe(true);
      expect(factory.isChainSupported(ChainType.BITCOIN)).toBe(true);
    });

    it('should return false for unsupported chains', () => {
      expect(factory.isChainSupported('UNSUPPORTED' as ChainType)).toBe(false);
      expect(factory.isChainSupported(ChainType.SUI)).toBe(false);
    });
  });
});
