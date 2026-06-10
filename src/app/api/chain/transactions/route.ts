import { getTransactions } from "@/lib/injective/queries";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import {
  badRequest,
  clampInt,
  isValidInjAddress,
  upstreamError,
} from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimit(`txs:${clientKey(req)}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  const limit = clampInt(searchParams.get("limit"), 10, 1, 25);

  if (!isValidInjAddress(address)) {
    return badRequest("Invalid Injective address. Expected bech32 'inj1…' (42 chars).");
  }

  try {
    const transactions = await getTransactions(address, limit);
    return Response.json(
      { transactions },
      { headers: { "Cache-Control": "private, max-age=15" } }
    );
  } catch {
    return upstreamError("Could not load transaction history. Try again shortly.");
  }
}
