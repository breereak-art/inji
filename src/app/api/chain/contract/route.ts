import { getContractReport } from "@/lib/injective/contracts";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import {
  badRequest,
  isValidInjAccountOrContract,
  upstreamError,
} from "@/lib/server/validate";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = rateLimit(`contract:${clientKey(req)}`, 20, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const address = new URL(req.url).searchParams.get("address");
  if (!isValidInjAccountOrContract(address)) {
    return badRequest("Provide a valid inj… address.");
  }

  try {
    const report = await getContractReport(address);
    return Response.json(report, {
      headers: { "Cache-Control": "public, max-age=120, s-maxage=600" },
    });
  } catch {
    return upstreamError("Could not inspect that address. Try again shortly.");
  }
}
