import { getHelixTopMarkets } from "@/lib/market/helix";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import { clampInt, upstreamError } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimit(`helix:${clientKey(req)}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const { searchParams } = new URL(req.url);
  const limit = clampInt(searchParams.get("limit"), 5, 1, 10);

  try {
    const markets = await getHelixTopMarkets(limit);
    return Response.json(
      { markets },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } }
    );
  } catch {
    return upstreamError("Helix market data is unavailable right now.");
  }
}
