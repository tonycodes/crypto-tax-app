import { Transaction, CostBasisEntry, CalculationMethod } from '@crypto-tax-app/shared';

export enum CostBasisMethod {
  FIFO = 'FIFO', // First In, First Out
  LIFO = 'LIFO', // Last In, First Out
  HIFO = 'HIFO', // Highest In, First Out (not implemented yet)
}

// Extended interface for internal calculation use
export interface ExtendedCostBasisEntry extends CostBasisEntry {
  id: string;
  userId: string;
  tokenSymbol: string;
  taxYear: number;
  isDisposed: boolean;
  disposalTxnId?: string;
}

export interface CostBasisResult {
  tokenSymbol: string;
  totalAcquired: string;
  totalDisposed: string;
  remainingQuantity: string;
  realizedGainLoss: string;
  costBasis: string;
  entries: ExtendedCostBasisEntry[];
}

export interface CalculationOptions {
  method: CalculationMethod;
  taxYear?: number;
  jurisdiction?: string;
}

/**
 * Cost Basis Calculator
 * Implements FIFO, LIFO, and future HIFO cost basis accounting methods
 * for cryptocurrency tax calculations
 */
export class CostBasisCalculator {
  /**
   * Calculate cost basis and realized gains/losses for a set of transactions
   */
  calculateCostBasis(transactions: Transaction[], options: CalculationOptions): CostBasisResult[] {
    // Group transactions by token symbol
    const transactionsByToken = this.groupTransactionsByToken(transactions);

    const results: CostBasisResult[] = [];

    for (const [tokenSymbol, tokenTransactions] of Array.from(transactionsByToken)) {
      const result = this.calculateTokenCostBasis(tokenSymbol, tokenTransactions, options);
      results.push(result);
    }

    return results;
  }

  /**
   * Calculate cost basis for a specific token
   */
  private calculateTokenCostBasis(
    tokenSymbol: string,
    transactions: Transaction[],
    options: CalculationOptions
  ): CostBasisResult {
    // Separate acquisitions and dispositions
    const acquisitions = transactions.filter(tx =>
      ['buy', 'airdrop', 'reward', 'mining'].includes(tx.type)
    );

    const dispositions = transactions.filter(
      tx => ['sell', 'swap', 'transfer'].includes(tx.type) && tx.amount.startsWith('-') // Negative amounts indicate outgoing
    );

    // Sort acquisitions based on method
    const sortedAcquisitions = this.sortAcquisitions(acquisitions, options.method);

    // Calculate cost basis using the specified method
    const costBasisEntries = this.applyCostBasisMethod(sortedAcquisitions, dispositions, options);

    // Calculate totals
    const totalAcquired = acquisitions
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0)
      .toString();

    const totalDisposed = dispositions
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0)
      .toString();

    const remainingQuantity = (parseFloat(totalAcquired) - parseFloat(totalDisposed)).toString();

    const realizedGainLoss = costBasisEntries
      .filter(entry => entry.isDisposed)
      .reduce((sum, entry) => sum + parseFloat(entry.costBasisUSD), 0)
      .toString();

    const totalCostBasis = costBasisEntries
      .filter(entry => !entry.isDisposed)
      .reduce((sum, entry) => sum + parseFloat(entry.costBasisUSD), 0)
      .toString();

    return {
      tokenSymbol,
      totalAcquired,
      totalDisposed,
      remainingQuantity,
      realizedGainLoss,
      costBasis: totalCostBasis,
      entries: costBasisEntries,
    };
  }

  /**
   * Group transactions by token symbol
   */
  private groupTransactionsByToken(transactions: Transaction[]): Map<string, Transaction[]> {
    const groups = new Map<string, Transaction[]>();

    for (const transaction of transactions) {
      const symbol = transaction.tokenSymbol;
      if (!groups.has(symbol)) {
        groups.set(symbol, []);
      }
      groups.get(symbol)!.push(transaction);
    }

    return groups;
  }

  /**
   * Sort acquisitions based on the cost basis method
   */
  private sortAcquisitions(acquisitions: Transaction[], method: CalculationMethod): Transaction[] {
    const sorted = [...acquisitions].sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();

      switch (method) {
        case 'FIFO':
          return dateA - dateB; // Oldest first

        case 'LIFO':
          return dateB - dateA; // Newest first

        default:
          return dateA - dateB;
      }
    });

    return sorted;
  }

  /**
   * Apply the cost basis method to calculate gains/losses
   */
  private applyCostBasisMethod(
    acquisitions: Transaction[],
    dispositions: Transaction[],
    options: CalculationOptions
  ): ExtendedCostBasisEntry[] {
    const entries: ExtendedCostBasisEntry[] = [];
    let acquisitionIndex = 0;

    // Convert acquisitions to cost basis entries
    for (const acquisition of acquisitions) {
      entries.push({
        id: `acq-${acquisition.id}`,
        userId: 'placeholder', // Will be set by calling code
        transactionId: acquisition.id,
        tokenSymbol: acquisition.tokenSymbol,
        amount: acquisition.amount,
        costBasisUSD: parseFloat(acquisition.amount) * (acquisition.priceUSD || 0),
        acquisitionDate: new Date(acquisition.timestamp),
        method: options.method,
        taxYear: options.taxYear || new Date().getFullYear(),
        isDisposed: false,
      });
    }

    // Process dispositions and match with acquisitions
    for (const disposition of dispositions) {
      let remainingToDispose = Math.abs(parseFloat(disposition.amount));
      const dispositionPrice = disposition.priceUSD || 0;

      // Match with available acquisitions
      while (remainingToDispose > 0 && acquisitionIndex < entries.length) {
        const entry = entries[acquisitionIndex];

        if (entry.isDisposed) {
          acquisitionIndex++;
          continue;
        }

        const availableAmount = parseFloat(entry.amount);

        if (availableAmount <= remainingToDispose) {
          // Use entire acquisition
          const gainLoss =
            (dispositionPrice - parseFloat(entry.costBasisUSD) / availableAmount) * availableAmount;

          entries.push({
            id: `disp-${disposition.id}-${acquisitionIndex}`,
            userId: 'placeholder',
            transactionId: disposition.id,
            tokenSymbol: disposition.tokenSymbol,
            amount: (-availableAmount).toString(), // Negative for disposition
            costBasisUSD: gainLoss,
            acquisitionDate: entry.acquisitionDate,
            method: options.method,
            taxYear: options.taxYear || new Date().getFullYear(),
            isDisposed: true,
            disposalTxnId: disposition.id,
          });

          entry.isDisposed = true;
          remainingToDispose -= availableAmount;
          acquisitionIndex++;
        } else {
          // Use partial acquisition
          const usedAmount = remainingToDispose;
          const gainLoss =
            (dispositionPrice - parseFloat(entry.costBasisUSD) / availableAmount) * usedAmount;

          entries.push({
            id: `disp-${disposition.id}-${acquisitionIndex}-partial`,
            userId: 'placeholder',
            transactionId: disposition.id,
            tokenSymbol: disposition.tokenSymbol,
            amount: (-usedAmount).toString(),
            costBasisUSD: gainLoss,
            acquisitionDate: entry.acquisitionDate,
            method: options.method,
            taxYear: options.taxYear || new Date().getFullYear(),
            isDisposed: true,
            disposalTxnId: disposition.id,
          });

          // Reduce the original acquisition amount
          entry.amount = (availableAmount - usedAmount).toString();
          entry.costBasisUSD = (
            (parseFloat(entry.costBasisUSD) / availableAmount) *
            (availableAmount - usedAmount)
          ).toString();

          remainingToDispose = 0;
        }
      }
    }

    return entries;
  }
}
