import type { Holding } from '../schemas/holding';
import type { PriceQuote } from '../api/types';

export type FxLookup = (from: string, to: string) => number | undefined;

export interface HoldingRow extends Holding {
  price?: number;
  priceCurrency?: string;
  priceAsOf?: string;
  priceProvider?: string;
  costBasisBase: number;
  marketValueBase?: number;
  unrealizedPL?: number;
  unrealizedPLPct?: number;
  weight?: number;
}

export interface PortfolioSummary {
  totalCost: number;
  totalMV?: number;
  totalPL?: number;
  totalPLPct?: number;
  byAssetType: Record<string, number>; // assetType → MV in base
  byMarket: Record<string, number>;    // market → MV in base
}

function safeNum(n: number): number | undefined {
  return isFinite(n) ? n : undefined;
}

export function deriveRow(
  h: Holding,
  quote: PriceQuote | undefined,
  fx: FxLookup,
  base: string,
): HoldingRow {
  // costBasisBase — NaN when FX rate is missing
  const costFx = h.costCurrency === base ? 1 : (fx(h.costCurrency, base) ?? NaN);
  const costBasisBase = h.quantity * h.avgCost * costFx;

  let price: number | undefined;
  let priceCurrency: string | undefined;
  let priceAsOf: string | undefined;
  let priceProvider: string | undefined;
  let marketValueBase: number | undefined;
  let unrealizedPL: number | undefined;
  let unrealizedPLPct: number | undefined;

  const resolvedPrice = quote?.price ?? h.manualPrice;
  const resolvedCurrency = quote?.currency ?? h.quoteCurrency;
  const resolvedAsOf = quote?.asOf ?? h.manualPriceAsOf;
  const resolvedProvider = quote?.provider ?? h.manualPriceProvider;

  if (resolvedPrice !== undefined) {
    price = resolvedPrice;
    priceCurrency = resolvedCurrency;
    priceAsOf = resolvedAsOf;
    priceProvider = resolvedProvider;

    const quoteFx = resolvedCurrency === base ? 1 : (fx(resolvedCurrency, base) ?? NaN);
    const mv = h.quantity * resolvedPrice * quoteFx;
    marketValueBase = safeNum(mv);

    if (marketValueBase !== undefined && isFinite(costBasisBase)) {
      unrealizedPL = safeNum(marketValueBase - costBasisBase);
      if (costBasisBase === 0) {
        // Zero cost — PL% is Infinity; represent as undefined to let UI handle it
        unrealizedPLPct = undefined;
      } else {
        unrealizedPLPct = safeNum((marketValueBase - costBasisBase) / costBasisBase);
      }
    }
  }

  return {
    ...h,
    price,
    priceCurrency,
    priceAsOf,
    priceProvider,
    costBasisBase,
    marketValueBase,
    unrealizedPL,
    unrealizedPLPct,
    // weight is filled in by derivePortfolio
    weight: undefined,
  };
}

export function derivePortfolio(rows: HoldingRow[]): PortfolioSummary {
  let totalCost = 0;
  let totalMVAcc = 0;
  let allMVKnown = rows.length > 0;

  const byAssetType: Record<string, number> = {};
  const byMarket: Record<string, number> = {};

  for (const row of rows) {
    if (isFinite(row.costBasisBase)) {
      totalCost += row.costBasisBase;
    }

    if (row.marketValueBase !== undefined) {
      totalMVAcc += row.marketValueBase;
      byAssetType[row.assetType] = (byAssetType[row.assetType] ?? 0) + row.marketValueBase;
      byMarket[row.market] = (byMarket[row.market] ?? 0) + row.marketValueBase;
    } else {
      allMVKnown = false;
    }
  }

  const totalMV = allMVKnown ? totalMVAcc : (rows.some((r) => r.marketValueBase !== undefined) ? totalMVAcc : undefined);
  const totalPL = totalMV !== undefined && isFinite(totalCost) ? totalMV - totalCost : undefined;
  const totalPLPct = totalPL !== undefined && totalCost !== 0 ? totalPL / totalCost : undefined;

  // Assign weights now that we know totalMV
  if (totalMV !== undefined && totalMV > 0) {
    for (const row of rows) {
      if (row.marketValueBase !== undefined) {
        row.weight = row.marketValueBase / totalMV;
      }
    }
  }

  return {
    totalCost,
    totalMV,
    totalPL,
    totalPLPct,
    byAssetType,
    byMarket,
  };
}
