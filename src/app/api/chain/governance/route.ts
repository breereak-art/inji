import { getGovernance } from "@/lib/injective/queries";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import { upstreamError } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimit(`gov:${clientKey(req)}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  try {
    const proposals = await getGovernance();
    return Response.json(
      { proposals },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } }
    );
  } catch {
    return upstreamError("Could not load governance proposals. Try again shortly.");
  }
}
