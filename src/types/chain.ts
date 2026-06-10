export interface BalanceData {
  address: string;
  balance: string; // "47.2310"
  balanceUSD: string; // "812.45"
  denom: "inj";
  raw: string; // base units (1e18)
}

export interface TxData {
  hash: string;
  type: string; // human label: "Sent", "Staked", ...
  amount: string; // "2.00 INJ" or "—"
  from: string;
  to: string;
  time: string; // ISO 8601
  status: "success" | "failed";
  fee: string;
}

export type GasStatus = "low" | "normal" | "high";

export interface GasData {
  gasPrice: string; // base units as string
  gasPriceGwei: string; // human display in "gwei"-style units
  status: GasStatus;
  safe: boolean;
  recommendation: string;
}

export interface GovernanceProposal {
  id: number;
  title: string;
  description: string; // truncated
  status: string;
  yesPercent: number;
  noPercent: number;
  endTime: string; // ISO 8601
  urgent: boolean; // ends < 24h
}
