import {
  IBlockchainAdapter,
  IBlockchainAdapterFactory,
  ChainType,
} from './adapters/adapter.interface';
import { EthereumAdapter } from './adapters/ethereum.adapter';
import { SolanaAdapter } from './adapters/solana.adapter';
import { BitcoinAdapter } from './adapters/bitcoin.adapter';

export class BlockchainAdapterFactory implements IBlockchainAdapterFactory {
  private adapters: Map<ChainType, () => IBlockchainAdapter>;

  constructor() {
    this.adapters = new Map<ChainType, () => IBlockchainAdapter>([
      [ChainType.ETHEREUM, () => new EthereumAdapter()],
      [ChainType.SOLANA, () => new SolanaAdapter()],
      [ChainType.BITCOIN, () => new BitcoinAdapter()],
      // SUI adapter can be added when implemented
      // [ChainType.SUI, () => new SuiAdapter()],
    ]);
  }

  createAdapter(chain: ChainType): IBlockchainAdapter {
    const adapterFactory = this.adapters.get(chain);

    if (!adapterFactory) {
      throw new Error(`Unsupported blockchain: ${chain}`);
    }

    return adapterFactory();
  }

  getSupportedChains(): ChainType[] {
    return Array.from(this.adapters.keys());
  }

  isChainSupported(chain: ChainType): boolean {
    return this.adapters.has(chain);
  }
}

// Singleton instance for convenience
export const blockchainFactory = new BlockchainAdapterFactory();
