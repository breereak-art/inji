import {
  BaseAccount,
  ChainRestAuthApi,
  createTransaction,
  MsgSend,
  TxClient,
} from "@injectivelabs/sdk-ts";
import { fetchWithTimeout, withTimeout } from "@/lib/server/http";
import { injective } from "@/lib/injective/endpoints";
import type {
  BroadcastTxRequest,
  BroadcastTxResponse,
  PreparedTx,
  PrepareTxRequest,
} from "@/types/chat";

const FEE_INJ = "0.00004";
const SEND_FEE = {
  gas: "250000",
  amount: [{ denom: "inj", amount: "40000000000000" }], // 0.00004 INJ in wei
};

const EXPLORER_TX_URL = injective.explorerTxUrl;

/** Sender address has never been seen on chain (no funds received yet). */
export class AccountNotFoundError extends Error {
  constructor() {
    super("Account not found");
    this.name = "AccountNotFoundError";
  }
}

/** "0.25" -> "250000000000000000" — pure string arithmetic, no floats. */
function injToWei(amountInj: string): string {
  const [whole, frac = ""] = amountInj.split(".");
  const wei = `${whole}${frac.padEnd(18, "0")}`.replace(/^0+(?=\d)/, "");
  return wei;
}

export async function prepareSendTx(req: PrepareTxRequest): Promise<PreparedTx> {
  const authApi = new ChainRestAuthApi(injective.lcd);

  let account: BaseAccount;
  try {
    const accountResponse = await withTimeout(authApi.fetchAccount(req.sender), 10_000);
    account = BaseAccount.fromRestApi(accountResponse);
  } catch (e) {
    const code = (e as { code?: unknown })?.code;
    const message = e instanceof Error ? e.message : "";
    if (code === 404 || /not found/i.test(message)) {
      throw new AccountNotFoundError();
    }
    throw new Error("Account lookup failed");
  }

  const message = MsgSend.fromJSON({
    amount: { denom: "inj", amount: injToWei(req.amountInj) },
    srcInjectiveAddress: req.sender,
    dstInjectiveAddress: req.recipient,
  });

  const { bodyBytes, authInfoBytes } = createTransaction({
    message,
    memo: req.memo ?? "",
    fee: SEND_FEE,
    pubKey: req.pubKeyBase64,
    sequence: account.sequence,
    accountNumber: account.accountNumber,
    chainId: injective.chainId,
  });

  return {
    bodyBytes: Buffer.from(bodyBytes).toString("base64"),
    authInfoBytes: Buffer.from(authInfoBytes).toString("base64"),
    accountNumber: String(account.accountNumber),
    chainId: injective.chainId,
    feeInj: FEE_INJ,
  };
}

interface LcdBroadcastResponse {
  tx_response?: { code: number; txhash: string; raw_log: string };
  /** Non-200 rejections arrive as { code, message } instead of tx_response. */
  message?: string;
}

/** Strip tx hashes and codespace noise from a chain error line. */
function rejectionReason(raw: string): string {
  const cleaned = raw.replace(/['",]*\s*codespace=.*$/i, "").trim();
  const lastSegment = cleaned.split(":").slice(-2).join(":").trim();
  return (lastSegment || cleaned || raw).replace(/['"]+$/, "").slice(0, 120);
}

export async function broadcastSignedTx(
  req: BroadcastTxRequest
): Promise<BroadcastTxResponse> {
  // TxRaw is just { bodyBytes, authInfoBytes, signatures } — the wallet signed
  // these exact bytes, so we reassemble rather than re-encode anything.
  const txRaw = {
    bodyBytes: new Uint8Array(Buffer.from(req.bodyBytes, "base64")),
    authInfoBytes: new Uint8Array(Buffer.from(req.authInfoBytes, "base64")),
    signatures: [new Uint8Array(Buffer.from(req.signature, "base64"))],
  };
  const txBytes = TxClient.encode(txRaw);

  // The LCD reports rejections two ways: HTTP 200 with tx_response.code !== 0,
  // or HTTP 4xx/5xx with a top-level { message } (verified live) — handle both.
  const httpRes = await fetchWithTimeout(
    `${injective.lcd}/cosmos/tx/v1beta1/txs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx_bytes: txBytes, mode: "BROADCAST_MODE_SYNC" }),
    },
    15_000
  );
  const res = (await httpRes
    .json()
    .catch(() => ({}))) as LcdBroadcastResponse;

  if (!httpRes.ok) {
    throw new Error(
      `Broadcast rejected: ${rejectionReason(res.message || "chain refused the transaction")}`
    );
  }

  const txResponse = res.tx_response;
  if (!txResponse) throw new Error("Broadcast rejected: empty chain response");
  if (txResponse.code !== 0) {
    throw new Error(
      `Broadcast rejected: ${rejectionReason(txResponse.raw_log || "unknown chain error")}`
    );
  }

  return {
    txHash: txResponse.txhash,
    explorerUrl: `${EXPLORER_TX_URL}${txResponse.txhash}`,
  };
}
