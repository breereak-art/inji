export interface PriceData {
  price: number;
  change24h: number;
  marketCap: number | null;
  volume24h: number | null;
  currency: "usd";
  source: "coingecko" | "binance";
}

export interface HelixMarket {
  pair: string;
  price: number;
  change24h: number;
  volume24h: number;
}
