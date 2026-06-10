/** Injective bech32 account address: "inj1" + 38 lowercase base32 chars. */
const INJ_ADDRESS_RE = /^inj1[02-9ac-hj-np-z]{38}$/;

/** Contract addresses are 32-byte (inj1 + 58 chars); accounts are 20-byte. */
const INJ_ANY_ADDRESS_RE = /^inj1[02-9ac-hj-np-z]{38}(?:[02-9ac-hj-np-z]{20})?$/;

export function isValidInjAddress(address: unknown): address is string {
  return typeof address === "string" && INJ_ADDRESS_RE.test(address);
}

export function isValidInjAccountOrContract(
  address: unknown
): address is string {
  return typeof address === "string" && INJ_ANY_ADDRESS_RE.test(address);
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export function upstreamError(message: string): Response {
  return Response.json({ error: message }, { status: 502 });
}

export function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const n = raw === null ? NaN : Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
