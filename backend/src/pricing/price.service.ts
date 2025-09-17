import axios, { AxiosInstance } from 'axios';

export interface PriceData {
  timestamp: number;
  price: number;
  marketCap?: number;
  volume?: number;
}

export interface TokenPrice {
  symbol: string;
  price: number;
  timestamp: number;
  source: string;
}

/**
 * Price Service for fetching historical cryptocurrency prices
 * Uses CoinGecko API for reliable price data
 */
export class PriceService {
  private client: AxiosInstance;
  private cache = new Map<string, { data: PriceData; expires: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.coingecko.com/api/v3',
      timeout: 10000,
      headers: {
        Accept: 'application/json',
      },
    });
  }

  /**
   * Get historical price for a token at a specific timestamp
   */
  async getHistoricalPrice(
    tokenSymbol: string,
    timestamp: number,
    chain: string = 'ethereum'
  ): Promise<TokenPrice | null> {
    try {
      // Map token symbols to CoinGecko IDs
      const coinGeckoId = this.mapTokenToCoinGeckoId(tokenSymbol, chain);

      if (!coinGeckoId) {
        console.warn(`No CoinGecko mapping found for ${tokenSymbol} on ${chain}`);
        return null;
      }

      // Check cache first
      const cacheKey = `${coinGeckoId}-${timestamp}`;
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        return {
          symbol: tokenSymbol,
          price: cached.data.price,
          timestamp,
          source: 'coingecko-cache',
        };
      }

      // Convert timestamp to date string for CoinGecko API
      const date = new Date(timestamp);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format

      // Fetch historical price data
      const response = await this.client.get(`/coins/${coinGeckoId}/history`, {
        params: {
          date: dateStr,
          localization: false,
        },
      });

      if (!response.data?.market_data?.current_price?.usd) {
        console.warn(`No price data found for ${tokenSymbol} on ${dateStr}`);
        return null;
      }

      const price = response.data.market_data.current_price.usd;
      const marketCap = response.data.market_data.market_cap?.usd;
      const volume = response.data.market_data.total_volume?.usd;

      const priceData: PriceData = {
        timestamp,
        price,
        marketCap,
        volume,
      };

      // Cache the result
      this.cache.set(cacheKey, {
        data: priceData,
        expires: Date.now() + this.CACHE_TTL,
      });

      return {
        symbol: tokenSymbol,
        price,
        timestamp,
        source: 'coingecko',
      };
    } catch (error) {
      console.error(`Failed to fetch price for ${tokenSymbol}:`, error);
      return null;
    }
  }

  /**
   * Get current price for a token
   */
  async getCurrentPrice(
    tokenSymbol: string,
    chain: string = 'ethereum'
  ): Promise<TokenPrice | null> {
    try {
      const coinGeckoId = this.mapTokenToCoinGeckoId(tokenSymbol, chain);

      if (!coinGeckoId) {
        return null;
      }

      const response = await this.client.get(`/simple/price`, {
        params: {
          ids: coinGeckoId,
          vs_currencies: 'usd',
          include_market_cap: true,
          include_24hr_vol: true,
        },
      });

      if (!response.data?.[coinGeckoId]?.usd) {
        return null;
      }

      return {
        symbol: tokenSymbol,
        price: response.data[coinGeckoId].usd,
        timestamp: Date.now(),
        source: 'coingecko-current',
      };
    } catch (error) {
      console.error(`Failed to fetch current price for ${tokenSymbol}:`, error);
      return null;
    }
  }

  /**
   * Map token symbols to CoinGecko coin IDs
   */
  private mapTokenToCoinGeckoId(symbol: string, chain: string): string | null {
    const mappings: Record<string, Record<string, string>> = {
      // Native tokens
      ethereum: {
        ETH: 'ethereum',
        WETH: 'weth',
      },
      solana: {
        SOL: 'solana',
        WSOL: 'solana',
      },
      bitcoin: {
        BTC: 'bitcoin',
      },
      // ERC20 tokens (common ones)
      erc20: {
        USDT: 'tether',
        USDC: 'usd-coin',
        DAI: 'dai',
        WBTC: 'wrapped-bitcoin',
        UNI: 'uniswap',
        LINK: 'chainlink',
        AAVE: 'aave',
        MKR: 'maker',
        SNX: 'synthetix-network-token',
        COMP: 'compound-governance-token',
        YFI: 'yearn-finance',
        SUSHI: 'sushi',
        CRV: 'curve-dao-token',
        '1INCH': '1inch',
        BAL: 'balancer',
        REN: 'ren',
        LRC: 'loopring',
        ZRX: '0x',
        BAT: 'basic-attention-token',
        OMG: 'omisego',
        LPT: 'livepeer',
        GRT: 'the-graph',
        ANT: 'aragon',
        STORJ: 'storj',
        FIL: 'filecoin',
        ADA: 'cardano',
        DOT: 'polkadot',
        ATOM: 'cosmos',
        XTZ: 'tezos',
        ALGO: 'algorand',
        ICP: 'internet-computer',
        BCH: 'bitcoin-cash',
        LTC: 'litecoin',
        XLM: 'stellar',
        XRP: 'ripple',
        EOS: 'eos',
        TRX: 'tron',
        VET: 'vechain',
        THETA: 'theta-token',
        HBAR: 'hedera-hashgraph',
        FLOW: 'flow',
        MANA: 'decentraland',
        SAND: 'the-sandbox',
        ENJ: 'enjincoin',
        AXS: 'axie-infinity',
        GALA: 'gala',
        SLP: 'smooth-love-potion',
        CHZ: 'chiliz',
        AUDIO: 'audius',
      },
      // Solana tokens
      spl: {
        USDC: 'usd-coin',
        USDT: 'tether',
        RAY: 'raydium',
        SRM: 'serum',
        FIDA: 'bonfida',
        KIN: 'kin',
        ORCA: 'orca',
        MNGO: 'mango-markets',
        SBR: 'saber',
        STEP: 'step-finance',
        ATLAS: 'star-atlas',
        POLIS: 'star-atlas-dao',
        SAMO: 'samoyedcoin',
        BONK: 'bonk',
        WETH: 'weth',
        WBTC: 'wrapped-bitcoin',
      },
    };

    const upperSymbol = symbol.toUpperCase();

    // Try chain-specific mapping first
    const chainMapping = mappings[chain];
    if (chainMapping && chainMapping[upperSymbol]) {
      return chainMapping[upperSymbol];
    }

    // Try ERC20 mapping for Ethereum
    const erc20Mapping = mappings['erc20'];
    if (chain === 'ethereum' && erc20Mapping && erc20Mapping[upperSymbol]) {
      return erc20Mapping[upperSymbol];
    }

    // Try SPL mapping for Solana
    const splMapping = mappings['spl'];
    if (chain === 'solana' && splMapping && splMapping[upperSymbol]) {
      return splMapping[upperSymbol];
    }

    // Fallback to lowercase symbol (some CoinGecko IDs are lowercase)
    const lowerSymbol = symbol.toLowerCase();
    if (chainMapping && chainMapping[lowerSymbol]) {
      return chainMapping[lowerSymbol];
    }

    console.warn(`No CoinGecko mapping found for ${symbol} on ${chain}`);
    return null;
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const priceService = new PriceService();
