export type Role = "user" | "assistant";

/** A transaction INJI proposes; the user confirms and signs in their wallet. */
export interface TxProposal {
  kind: "send";
  recipient: string;
  /** Human units, e.g. "5" or "0.25" (INJ). */
  amountInj: string;
  /** Estimated network fee in INJ, e.g. "0.00004". */
  feeInj: string;
  memo?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** Present when INJI proposed a transaction in this turn. */
  proposal?: TxProposal;
}

export type IntentType =
  | "briefing"
  | "roast"
  | "balance"
  | "send"
  | "gas"
  | "txhistory"
  | "governance"
  | "price"
  | "trade-advice"
  | "contract-check"
  | "ecosystem"
  | "greeting"
  | "chat";

/** Market sentiment/momentum bundle for trade-advice answers. */
export interface MarketIntel {
  price: string;
  change24h: string;
  change7d: string;
  rsi14: string;
  volumeTrend: string;
  fearGreed: string;
  topHelixMarkets: string[];
  gas: string;
}

/** Heuristic safety read of a CosmWasm contract address. */
export interface ContractReport {
  address: string;
  isContract: boolean;
  label?: string;
  codeId?: string;
  creator?: string;
  admin?: string | null;
  tokenInfo?: { name: string; symbol: string; decimals: number; totalSupply: string };
  nftInfo?: { name: string; symbol: string };
  flags: { level: "danger" | "warning" | "info"; text: string }[];
}

/** SSE events emitted by /api/chat */
export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "status"; text: string }
  | { type: "tx_proposal"; proposal: TxProposal }
  | { type: "done"; intent: IntentType; usedSearch: boolean; toolsUsed: string[] }
  | { type: "error"; message: string };

/** POST /api/tx/prepare request body. */
export interface PrepareTxRequest {
  sender: string;
  recipient: string;
  /** Human units, decimal string, e.g. "5" or "0.25". */
  amountInj: string;
  /** Sender's secp256k1 pubkey, base64 (from wallet getKey). */
  pubKeyBase64: string;
  memo?: string;
}

/** POST /api/tx/prepare response — sign this with wallet signDirect. */
export interface PreparedTx {
  /** base64 TxBody bytes */
  bodyBytes: string;
  /** base64 AuthInfo bytes */
  authInfoBytes: string;
  /** stringified uint64 */
  accountNumber: string;
  chainId: string;
  feeInj: string;
}

/** POST /api/tx/broadcast request body (from wallet DirectSignResponse). */
export interface BroadcastTxRequest {
  /** base64 — from signResponse.signed.bodyBytes */
  bodyBytes: string;
  /** base64 — from signResponse.signed.authInfoBytes */
  authInfoBytes: string;
  /** base64 — from signResponse.signature.signature */
  signature: string;
}

export interface BroadcastTxResponse {
  txHash: string;
  explorerUrl: string;
}

/** Client-side signing flow state, rendered on the confirm card. */
export type TxFlowPhase =
  | "idle"
  | "preparing"
  | "signing"
  | "broadcasting"
  | "success"
  | "error";
