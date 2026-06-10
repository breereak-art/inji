import { broadcastSignedTx } from "@/lib/injective/tx";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import { badRequest, upstreamError } from "@/lib/server/validate";
import type { BroadcastTxRequest } from "@/types/chat";

export const runtime = "nodejs";

const MAX_BYTES_B64 = 20_000;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function isBase64(value: unknown, maxChars: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxChars &&
    value.length % 4 === 0 &&
    BASE64_RE.test(value)
  );
}

export async function POST(req: Request) {
  const rl = rateLimit(`txcast:${clientKey(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  let body: Partial<BroadcastTxRequest>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const { bodyBytes, authInfoBytes, signature } = body;

  if (!isBase64(bodyBytes, MAX_BYTES_B64)) {
    return badRequest("bodyBytes must be base64 (max 20000 chars).");
  }
  if (!isBase64(authInfoBytes, MAX_BYTES_B64)) {
    return badRequest("authInfoBytes must be base64 (max 20000 chars).");
  }
  if (!isBase64(signature, 96) || Buffer.from(signature, "base64").length !== 64) {
    return badRequest("Signature must be a base64-encoded 64-byte signature.");
  }

  try {
    const result = await broadcastSignedTx({ bodyBytes, authInfoBytes, signature });
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    if (message.startsWith("Broadcast rejected:")) {
      return upstreamError(message);
    }
    return upstreamError("Could not broadcast the transaction. Try again shortly.");
  }
}
