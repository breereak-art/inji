import { injective } from "@/lib/injective/endpoints";
import type {
  BroadcastTxRequest,
  BroadcastTxResponse,
  PrepareTxRequest,
  PreparedTx,
  TxFlowPhase,
  TxProposal,
} from "@/types/chat";

const CHAIN_ID = injective.chainId;

interface DirectSignResponse {
  signed: { bodyBytes: Uint8Array; authInfoBytes: Uint8Array };
  signature: { signature: string };
}

/** Native injected signing surface (Keplr/Leap) — no SDK in the client bundle. */
interface SigningWalletApi {
  getKey(chainId: string): Promise<{ pubKey: Uint8Array }>;
  signDirect(
    chainId: string,
    signer: string,
    signDoc: {
      bodyBytes: Uint8Array;
      authInfoBytes: Uint8Array;
      chainId: string;
      accountNumber: bigint;
    }
  ): Promise<DirectSignResponse>;
}

function getSigningApi(kind: "keplr" | "leap"): SigningWalletApi {
  const w = window as unknown as {
    keplr?: SigningWalletApi;
    leap?: SigningWalletApi;
  };
  const api = kind === "keplr" ? w.keplr : w.leap;
  if (!api) {
    throw new Error(
      `${kind === "keplr" ? "Keplr" : "Leap"} is not installed.`
    );
  }
  return api;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function sendInj(
  proposal: TxProposal,
  sender: string,
  walletKind: "keplr" | "leap" | "metamask",
  onPhase: (phase: TxFlowPhase, detail?: string) => void
): Promise<BroadcastTxResponse> {
  if (walletKind === "metamask") {
    throw new Error(
      "MetaMask signing ships next — connect Keplr or Leap to send."
    );
  }

  onPhase("preparing");
  const api = getSigningApi(walletKind);
  const key = await api.getKey(CHAIN_ID);
  const prepareBody: PrepareTxRequest = {
    sender,
    recipient: proposal.recipient,
    amountInj: proposal.amountInj,
    pubKeyBase64: toBase64(key.pubKey),
    ...(proposal.memo ? { memo: proposal.memo } : {}),
  };
  const prepared = await postJson<PreparedTx>("/api/tx/prepare", prepareBody);
  if (prepared.chainId !== CHAIN_ID) {
    throw new Error(
      `Network mismatch: server built for ${prepared.chainId}, wallet is on ${CHAIN_ID}.`
    );
  }

  // wallet rejection throws here — caller surfaces the message
  onPhase("signing");
  const signResponse = await api.signDirect(CHAIN_ID, sender, {
    bodyBytes: fromBase64(prepared.bodyBytes),
    authInfoBytes: fromBase64(prepared.authInfoBytes),
    chainId: prepared.chainId,
    accountNumber: BigInt(prepared.accountNumber),
  });

  onPhase("broadcasting");
  const broadcastBody: BroadcastTxRequest = {
    bodyBytes: toBase64(signResponse.signed.bodyBytes),
    authInfoBytes: toBase64(signResponse.signed.authInfoBytes),
    signature: signResponse.signature.signature,
  };
  return postJson<BroadcastTxResponse>("/api/tx/broadcast", broadcastBody);
}
