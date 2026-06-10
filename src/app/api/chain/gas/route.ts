import { getGas } from "@/lib/injective/queries";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import { upstreamError } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimit(`gas:${clientKey(req)}`, 60, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  try {
    const gas = await getGas();
    return Response.json(gas, {
      headers: { "Cache-Control": "public, max-age=10, s-maxage=15" },
    });
  } catch {
    return upstreamError("Could not read gas prices. Try again shortly.");
  }
}
