export interface PriceQuote {
  symbol: string;
  price: number;
  currency: string;
  asOf: string;
  provider: string;
}

export interface PriceProvider {
  name: string;
  getQuotes(symbols: string[]): Promise<PriceQuote[]>;
}

export interface FxProvider {
  name: string;
  getRate(from: string, to: string): Promise<number>;
}
