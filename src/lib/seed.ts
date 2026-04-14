import type { Holding } from '../schemas/holding';
import { getSeedVersion, loadHoldings, saveHoldings, setSeedVersion } from './storage';

const SEED_VERSION = 'portfolio-positions-draft-v2';
const SNAPSHOT_AS_OF = '2026-04-14T00:00:00.000Z';
const SNAPSHOT_PROVIDER = 'assets.md';

type SeedHolding = Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>;

const seedHoldings: SeedHolding[] = [
  {
    symbol: 'SPUS',
    name: 'SP Funds S&P 500 Sharia Industry Exclusions ETF',
    assetType: 'etf',
    market: 'ARCX',
    quantity: 1565.64526,
    avgCost: 48.897000673916,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    manualPrice: 50.389999583942,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md ETF allocation snapshot. Asset class: US Stocks.',
  },
  {
    symbol: 'ISDW.L',
    name: 'iShares MSCI World Islamic UCITS ETF',
    assetType: 'etf',
    market: 'XLON',
    quantity: 396.93645,
    avgCost: 206.641642509777,
    costCurrency: 'SAR',
    quoteCurrency: 'SAR',
    manualPrice: 224.606256240766,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md ETF allocation snapshot. Asset class: Developed Countries Stocks.',
  },
  {
    symbol: 'ISDE.L',
    name: 'iShares MSCI EM Islamic UCITS ETF',
    assetType: 'etf',
    market: 'XLON',
    quantity: 483.36158,
    avgCost: 84.847041421869,
    costCurrency: 'SAR',
    quoteCurrency: 'SAR',
    manualPrice: 111.375008332272,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md ETF allocation snapshot. Asset class: Emerging Markets Stocks.',
  },
  {
    symbol: 'SPSK',
    name: 'SP Funds Dow Jones Global Sukuk ETF',
    assetType: 'etf',
    market: 'XNAS',
    quantity: 3535.94278,
    avgCost: 18.557675868273,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    manualPrice: 18.030000662699,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md ETF allocation snapshot. Asset class: Sukuk.',
  },
  {
    symbol: 'GLD',
    name: 'SPDR Gold Shares',
    assetType: 'etf',
    market: 'ARCX',
    quantity: 62.58222,
    avgCost: 349.507575793892,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    manualPrice: 437.129992086144,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md ETF allocation snapshot. Asset class: Gold.',
  },
  {
    symbol: 'SPRE',
    name: 'SP Funds S&P Global REIT Sharia ETF',
    assetType: 'etf',
    market: 'ARCX',
    quantity: 1117.11166,
    avgCost: 19.579922744697,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    manualPrice: 20.589999033758,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md ETF allocation snapshot. Asset class: Real Estate.',
  },
  {
    symbol: '3092',
    name: 'Riyadh Cement',
    assetType: 'stock',
    market: 'XSAU',
    quantity: 293,
    avgCost: 28.37,
    costCurrency: 'SAR',
    quoteCurrency: 'SAR',
    manualPrice: 23.3,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md Saudi individual stocks snapshot.',
  },
  {
    symbol: '2110',
    name: 'Saudi Cable',
    assetType: 'stock',
    market: 'XSAU',
    quantity: 66,
    avgCost: 155.37,
    costCurrency: 'SAR',
    quoteCurrency: 'SAR',
    manualPrice: 158.3,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md Saudi individual stocks snapshot.',
  },
  {
    symbol: '8030',
    name: 'Medgulf',
    assetType: 'stock',
    market: 'XSAU',
    quantity: 661,
    avgCost: 16.89,
    costCurrency: 'SAR',
    quoteCurrency: 'SAR',
    manualPrice: 14.09,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md Saudi individual stocks snapshot.',
  },
  {
    symbol: '2010',
    name: 'SABIC',
    assetType: 'stock',
    market: 'XSAU',
    quantity: 166,
    avgCost: 61.81,
    costCurrency: 'SAR',
    quoteCurrency: 'SAR',
    manualPrice: 59.75,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md Saudi individual stocks snapshot.',
  },
  {
    symbol: 'LLY',
    name: 'Eli Lilly',
    assetType: 'stock',
    market: 'XNYS',
    quantity: 11.853,
    avgCost: 1077.015415254,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    manualPrice: 935.02,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md US/global stock snapshot using user-confirmed quantity and average cost.',
  },
  {
    symbol: 'MDB',
    name: 'MongoDB',
    assetType: 'stock',
    market: 'XNAS',
    quantity: 16.4443,
    avgCost: 425.678995754,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    manualPrice: 223.99,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md US/global stock snapshot using user-confirmed quantity and average cost.',
  },
  {
    symbol: 'MSTR',
    name: 'MicroStrategy',
    assetType: 'stock',
    market: 'XNAS',
    quantity: 25.4,
    avgCost: 155.702677165,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    manualPrice: 124.53,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md US/global stock snapshot using user-confirmed quantity and average cost.',
  },
  {
    symbol: 'NVDA',
    name: 'NVIDIA',
    assetType: 'stock',
    market: 'XNAS',
    quantity: 64.291,
    avgCost: 188.634065375,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    manualPrice: 186.12,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md US/global stock snapshot using user-confirmed quantity and average cost.',
  },
  {
    symbol: 'TSM',
    name: 'Taiwan Semiconductor',
    assetType: 'stock',
    market: 'XNYS',
    quantity: 22.5295,
    avgCost: 297.387729632,
    costCurrency: 'USD',
    quoteCurrency: 'USD',
    manualPrice: 367.23,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md US/global stock snapshot using user-confirmed quantity and average cost.',
  },
  {
    symbol: 'ITFS',
    name: 'Sunbullah Fund SAR (ITFS)',
    assetType: 'fund',
    market: 'MONEYMARKET',
    quantity: 3650.9,
    avgCost: 142.705730093949,
    costCurrency: 'SAR',
    quoteCurrency: 'SAR',
    manualPrice: 144.868555698595,
    manualPriceAsOf: SNAPSHOT_AS_OF,
    manualPriceProvider: SNAPSHOT_PROVIDER,
    notes: 'Imported from assets.md money market snapshot. Visible unlabeled metric 71.52% preserved from source; source note also says Money market 100%.',
  },
];

export function ensureSeedPortfolio(): void {
  if (getSeedVersion() === SEED_VERSION) return;

  const holdings = loadHoldings();

  const now = new Date().toISOString();
  const seeded: Holding[] = seedHoldings.map((holding, index) => ({
    ...holding,
    id: `seed-${index + 1}`,
    createdAt: now,
    updatedAt: now,
  }));

  if (holdings.length === 0) {
    saveHoldings(seeded);
    setSeedVersion(SEED_VERSION);
    return;
  }

  const onlySeededHoldings = holdings.every((holding) => holding.id.startsWith('seed-'));
  if (onlySeededHoldings) {
    saveHoldings(seeded);
    setSeedVersion(SEED_VERSION);
    return;
  }

  setSeedVersion(SEED_VERSION);
}
