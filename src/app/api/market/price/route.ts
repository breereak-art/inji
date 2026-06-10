import { getInjPrice } from "@/lib/market/coingecko";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import { upstreamError } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimit(`price:${clientKey(req)}`, 60, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  try {
    const price = await getInjPrice();
    return Response.json(price, {
      headers: { "Cache-Control": "public, max-age=15, s-maxage=30" },
    });
  } catch {
    return upstreamError("Price feeds are unavailable right now.");
  }
}
