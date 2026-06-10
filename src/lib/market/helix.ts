import { cached } from "@/lib/server/cache";
import { fetchJson } from "@/lib/server/http";
import type { HelixMarket } from "@/types/market";

/**
 * Helix (Injective's flagship DEX) market summaries via the public
 * chronos indexer. Shape: array of { market_id, price, change, volume }.
 * Market ids are mapped to readable pairs via the derivative/spot
 * markets list, but for the top-line summary we use the dedicated
 * summary endpoint that already aggregates 24h stats.
 */

const CHRONOS_SPOT_SUMMARY =
  "https://sentry.exchange.grpc-web.injective.network/api/chronos/v1/spot/market_summary_all?resolution=24h";
const SPOT_MARKETS_URL =
  "https://sentry.exchange.grpc-web.injective.network/api/exchange/spot/v1/markets?marketStatus=active";

// chronos market_summary_all returns human-readable price/change/volume
// (verified empirically against live INJ/USDT + USDC/USDT data)
interface ChronosSummary {
  marketId: string;
  price: number;
  change: number;
  volume: number;
}

interface SpotMarketsResponse {
  markets?: {
    marketId: string;
    ticker: string;
  }[];
}

export function getHelixTopMarkets(limit = 5): Promise<HelixMarket[]> {
  return cached(`market:helix-top:${limit}`, 60_000, async () => {
    const [summaries, marketsRes] = await Promise.all([
      fetchJson<ChronosSummary[]>(CHRONOS_SPOT_SUMMARY, {}, 8000),
      fetchJson<SpotMarketsResponse>(SPOT_MARKETS_URL, {}, 8000),
    ]);

    if (!Array.isArray(summaries)) throw new Error("Chronos: malformed response");

    const tickers = new Map(
      (marketsRes.markets ?? []).map((m) => [m.marketId, m.ticker])
    );

    return summaries
      .filter(
        (s) =>
          tickers.has(s.marketId) &&
          Number.isFinite(s.volume) &&
          Number.isFinite(s.price)
      )
      .map((s) => ({
        pair: tickers.get(s.marketId)!,
        price: s.price,
        change24h: Number.isFinite(s.change) ? s.change : 0,
        volume24h: s.volume,
      }))
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, limit);
  });
}
