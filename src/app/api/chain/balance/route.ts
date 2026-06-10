import { getBalance } from "@/lib/injective/queries";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import { badRequest, isValidInjAddress, upstreamError } from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimit(`balance:${clientKey(req)}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");

  if (!isValidInjAddress(address)) {
    return badRequest("Invalid Injective address. Expected bech32 'inj1…' (42 chars).");
  }

  try {
    const balance = await getBalance(address);
    return Response.json(balance, {
      headers: { "Cache-Control": "private, max-age=10" },
    });
  } catch {
    return upstreamError("Could not reach the Injective chain. Try again shortly.");
  }
}
