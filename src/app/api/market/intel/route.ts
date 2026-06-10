import { buildMarketIntel } from "@/lib/market/sentiment";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import { upstreamError } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimit(`intel:${clientKey(req)}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  try {
    const intel = await buildMarketIntel();
    return Response.json(intel, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=300" },
    });
  } catch {
    return upstreamError("Could not load market intel. Try again shortly.");
  }
}
