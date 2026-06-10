import { cached } from "@/lib/server/cache";
import { fetchJson } from "@/lib/server/http";
import type { PriceData } from "@/types/market";

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=injective-protocol&price_change_percentage=24h";
const BINANCE_URL =
  "https://api.binance.com/api/v3/ticker/24hr?symbol=INJUSDT";

interface CoinGeckoRow {
  current_price: number;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  total_volume: number | null;
}

interface BinanceTicker {
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

async function fromCoinGecko(): Promise<PriceData> {
  const headers: Record<string, string> = {};
  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  }
  const rows = await fetchJson<CoinGeckoRow[]>(COINGECKO_URL, { headers }, 6000);
  const row = rows?.[0];
  if (!row || typeof row.current_price !== "number") {
    throw new Error("CoinGecko: malformed response");
  }
  return {
    price: row.current_price,
    change24h: row.price_change_percentage_24h ?? 0,
    marketCap: row.market_cap,
    volume24h: row.total_volume,
    currency: "usd",
    source: "coingecko",
  };
}

async function fromBinance(): Promise<PriceData> {
  const t = await fetchJson<BinanceTicker>(BINANCE_URL, {}, 6000);
  const price = Number.parseFloat(t.lastPrice);
  if (!Number.isFinite(price)) throw new Error("Binance: malformed response");
  return {
    price,
    change24h: Number.parseFloat(t.priceChangePercent) || 0,
    marketCap: null,
    volume24h: Number.parseFloat(t.quoteVolume) || null,
    currency: "usd",
    source: "binance",
  };
}

/** INJ/USD with CoinGecko primary, Binance fallback. Cached 30s, stale-tolerant. */
export function getInjPrice(): Promise<PriceData> {
  return cached("market:inj-price", 30_000, async () => {
    try {
      return await fromCoinGecko();
    } catch {
      return await fromBinance();
    }
  });
}
