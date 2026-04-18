import { PRICE_REFRESH_INTERVAL_SEC } from './config.js';

export const DEFAULT_SETTINGS = {
  baseCurrency: 'SAR',
  priceProvider: 'auto',
  fxProvider: 'frankfurter',
  refreshIntervalSec: PRICE_REFRESH_INTERVAL_SEC,
  theme: 'dark',
};

export function buildEmptyPortfolioSnapshot() {
  return {
    holdings: [],
    settings: { ...DEFAULT_SETTINGS },
    watchlist: [],
  };
}

export function buildDefaultPortfolioSnapshot() {
  return buildEmptyPortfolioSnapshot();
}
