import { AccountNotFoundError, prepareSendTx } from "@/lib/injective/tx";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import { badRequest, isValidInjAddress, upstreamError } from "@/lib/server/validate";
import type { PrepareTxRequest } from "@/types/chat";

export const runtime = "nodejs";

const MAX_INJ = 1_000_000n * 10n ** 18n; // 1,000,000 INJ in wei
const AMOUNT_RE = /^\d+(\.\d{1,18})?$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function amountWei(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole + frac.padEnd(18, "0"));
}

function decodedBase64Length(value: string): number {
  if (!BASE64_RE.test(value) || value.length % 4 !== 0) return -1;
  return Buffer.from(value, "base64").length;
}

export async function POST(req: Request) {
  const rl = rateLimit(`txprep:${clientKey(req)}`, 10, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  let body: Partial<PrepareTxRequest>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const { sender, recipient, amountInj, pubKeyBase64, memo } = body;

  if (!isValidInjAddress(sender)) {
    return badRequest("Invalid sender address.");
  }
  if (!isValidInjAddress(recipient)) {
    return badRequest("Invalid recipient address.");
  }
  if (typeof amountInj !== "string" || !AMOUNT_RE.test(amountInj)) {
    return badRequest("Amount must be a decimal string with at most 18 decimals.");
  }
  const wei = amountWei(amountInj);
  if (wei <= 0n) {
    return badRequest("Amount must be greater than zero.");
  }
  if (wei > MAX_INJ) {
    return badRequest("Amount exceeds the 1,000,000 INJ limit.");
  }
  if (typeof pubKeyBase64 !== "string" || decodedBase64Length(pubKeyBase64) !== 33) {
    return badRequest("Public key must be a base64-encoded 33-byte secp256k1 key.");
  }
  if (memo !== undefined && (typeof memo !== "string" || memo.length > 256)) {
    return badRequest("Memo must be a string of at most 256 characters.");
  }

  try {
    const prepared = await prepareSendTx({
      sender,
      recipient,
      amountInj,
      pubKeyBase64,
      memo,
    });
    return Response.json(prepared);
  } catch (e) {
    if (e instanceof AccountNotFoundError) {
      return badRequest("Sender account has no on-chain history.");
    }
    return upstreamError("Could not prepare the transaction. Try again shortly.");
  }
}
