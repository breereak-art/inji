import { cached } from "@/lib/server/cache";
import { fetchJson, withTimeout } from "@/lib/server/http";
import { getInjPrice } from "@/lib/market/coingecko";
import { getHelixTopMarkets } from "@/lib/market/helix";
import { getGas } from "@/lib/injective/queries";
import type { MarketIntel } from "@/types/chat";

const FNG_URL = "https://api.alternative.me/fng/?limit=1";
const CHART_URL =
  "https://api.coingecko.com/api/v3/coins/injective-protocol/market_chart?vs_currency=usd&days=15&interval=daily";

interface FngResponse {
  data?: { value?: string; value_classification?: string }[];
}

interface MarketChart {
  prices?: [number, number][];
  total_volumes?: [number, number][];
}

interface Momentum {
  change7d: number;
  rsi14: number | null;
  volumeTrend: number; // latest daily volume vs prior-7-day average, in %
}

/** Crypto-wide Fear & Greed index (alternative.me). Cached 30 min. */
function getFearGreed(): Promise<{ value: number; label: string }> {
  return cached("market:fear-greed", 30 * 60_000, async () => {
    const res = await fetchJson<FngResponse>(FNG_URL, {}, 6000);
    const row = res.data?.[0];
    const value = Number(row?.value);
    if (!Number.isFinite(value)) throw new Error("FNG: malformed response");
    return { value, label: row?.value_classification ?? "Unknown" };
  });
}

/** 14-period RSI from daily closes (classic Wilder smoothing-free variant). */
function computeRsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const recent = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

/** 7d momentum, RSI-14 and volume trend from CoinGecko daily data. Cached 5 min. */
function getMomentum(): Promise<Momentum> {
  return cached("market:inj-momentum", 5 * 60_000, async () => {
    const headers: Record<string, string> = {};
    if (process.env.COINGECKO_API_KEY) {
      headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
    }
    const chart = await fetchJson<MarketChart>(CHART_URL, { headers }, 8000);
    const closes = (chart.prices ?? []).map(([, p]) => p);
    const volumes = (chart.total_volumes ?? []).map(([, v]) => v);
    if (closes.length < 8) throw new Error("CoinGecko chart: not enough data");

    const last = closes[closes.length - 1];
    const weekAgo = closes[closes.length - 8];
    const change7d = ((last - weekAgo) / weekAgo) * 100;

    let volumeTrend = 0;
    if (volumes.length >= 8) {
      const lastVol = volumes[volumes.length - 1];
      const prior = volumes.slice(-8, -1);
      const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
      if (avg > 0) volumeTrend = ((lastVol - avg) / avg) * 100;
    }

    return { change7d, rsi14: computeRsi(closes), volumeTrend };
  });
}

/**
 * Everything INJI needs to give a grounded "should I buy?" answer.
 * Every source is best-effort — missing data degrades to "unavailable"
 * so a flaky upstream never blocks the chat.
 */
export async function buildMarketIntel(): Promise<MarketIntel> {
  const BUDGET = 9000;
  const [price, momentum, fng, helix, gas] = await Promise.allSettled([
    withTimeout(getInjPrice(), BUDGET),
    withTimeout(getMomentum(), BUDGET),
    withTimeout(getFearGreed(), BUDGET),
    withTimeout(getHelixTopMarkets(3), BUDGET),
    withTimeout(getGas(), BUDGET),
  ]);

  const p = price.status === "fulfilled" ? price.value : null;
  const m = momentum.status === "fulfilled" ? momentum.value : null;
  const f = fng.status === "fulfilled" ? fng.value : null;

  return {
    price: p ? `$${p.price.toFixed(2)}` : "unavailable",
    change24h: p ? `${p.change24h.toFixed(2)}%` : "unavailable",
    change7d: m ? `${m.change7d.toFixed(2)}%` : "unavailable",
    rsi14:
      m?.rsi14 != null
        ? `${m.rsi14.toFixed(0)} (${m.rsi14 >= 70 ? "overbought" : m.rsi14 <= 30 ? "oversold" : "neutral"})`
        : "unavailable",
    volumeTrend: m
      ? `${m.volumeTrend >= 0 ? "+" : ""}${m.volumeTrend.toFixed(0)}% vs 7d avg`
      : "unavailable",
    fearGreed: f ? `${f.value}/100 (${f.label})` : "unavailable",
    topHelixMarkets:
      helix.status === "fulfilled"
        ? helix.value.map(
            (mkt) =>
              `${mkt.pair}: $${mkt.price < 0.01 ? mkt.price : mkt.price.toFixed(mkt.price < 1 ? 4 : 2)} (${mkt.change24h.toFixed(1)}% 24h, vol $${Math.round(mkt.volume24h).toLocaleString("en-US")})`
          )
        : [],
    gas:
      gas.status === "fulfilled"
        ? `${gas.value.gasPriceGwei} gwei-equivalent (${gas.value.status})`
        : "unavailable",
  };
}
