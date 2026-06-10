import { cached } from "@/lib/server/cache";
import { fetchJson } from "@/lib/server/http";
import { injective } from "@/lib/injective/endpoints";
import { getInjPrice } from "@/lib/market/coingecko";
import type {
  BalanceData,
  GasData,
  GasStatus,
  GovernanceProposal,
  TxData,
} from "@/types/chain";

const INJ_DECIMALS = 1e18;

/* ────────────────────────── Balance ────────────────────────── */

interface BankBalancesResponse {
  balances?: { denom: string; amount: string }[];
}

export function getBalance(address: string): Promise<BalanceData> {
  return cached(`chain:balance:${address}`, 10_000, async () => {
    const [bank, price] = await Promise.all([
      fetchJson<BankBalancesResponse>(
        `${injective.lcd}/cosmos/bank/v1beta1/balances/${address}`,
        {},
        8000
      ),
      getInjPrice().catch(() => null),
    ]);

    const raw = bank.balances?.find((b) => b.denom === "inj")?.amount ?? "0";
    const inj = Number(raw) / INJ_DECIMALS;
    const usd = price ? inj * price.price : null;

    return {
      address,
      balance: inj.toFixed(4),
      balanceUSD: usd === null ? "—" : usd.toFixed(2),
      denom: "inj",
      raw,
    };
  });
}

/* ────────────────────────── Gas ────────────────────────── */

// Injective gas thresholds (in inj base units per gas):
//   < 500M low · 500M–2B normal · > 2B high
const GAS_LOW = 500_000_000;
const GAS_HIGH = 2_000_000_000;
const DEFAULT_GAS_PRICE = 160_000_000; // chain default when dynamic fee is idle

// Candidate LCD paths for the dynamic EIP-1559-style base fee; node
// versions have shifted this path, so we probe in order.
const BASE_FEE_PATHS = [
  "/injective/txfees/v1beta1/cur_eip_base_fee",
  "/osmosis/txfees/v1beta1/cur_eip_base_fee",
];

export function getGas(): Promise<GasData> {
  return cached("chain:gas", 15_000, async () => {
    let gasPrice = DEFAULT_GAS_PRICE;

    for (const path of BASE_FEE_PATHS) {
      try {
        const res = await fetchJson<Record<string, string>>(
          `${injective.lcd}${path}`,
          {},
          5000
        );
        const value = Object.values(res)[0];
        const parsed = Number.parseFloat(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          // returned as a decimal in inj base units per gas
          gasPrice = Math.round(parsed > 1e6 ? parsed : parsed * INJ_DECIMALS);
          break;
        }
      } catch {
        // try next path; fall back to the chain default
      }
    }

    const status: GasStatus =
      gasPrice < GAS_LOW ? "low" : gasPrice <= GAS_HIGH ? "normal" : "high";
    const safe = status !== "high";

    return {
      gasPrice: String(gasPrice),
      gasPriceGwei: (gasPrice / 1e9).toFixed(2),
      status,
      safe,
      recommendation: safe
        ? `Gas is ${status} (${(gasPrice / 1e9).toFixed(2)} gwei-equivalent). Fine to transact.`
        : "Gas is elevated right now. Non-urgent transactions can wait.",
    };
  });
}

/* ────────────────────────── Governance ────────────────────────── */

interface GovV1Proposal {
  id: string;
  status: string;
  title?: string;
  summary?: string;
  voting_end_time?: string;
  final_tally_result?: {
    yes_count?: string;
    no_count?: string;
    no_with_veto_count?: string;
  };
  messages?: { "@type"?: string; content?: { title?: string; description?: string } }[];
}

function statusLabel(status: string): string {
  if (status.includes("VOTING")) return "voting";
  if (status.includes("PASSED")) return "passed";
  if (status.includes("REJECTED")) return "rejected";
  if (status.includes("FAILED")) return "failed";
  return status.toLowerCase();
}

interface GovV1Response {
  proposals?: GovV1Proposal[];
}

interface TallyResponse {
  tally?: {
    yes_count?: string;
    no_count?: string;
    abstain_count?: string;
    no_with_veto_count?: string;
  };
}

export function getGovernance(): Promise<GovernanceProposal[]> {
  return cached("chain:governance", 5 * 60_000, async () => {
    const voting = await fetchJson<GovV1Response>(
      `${injective.lcd}/cosmos/gov/v1/proposals?proposal_status=2&pagination.limit=20&pagination.reverse=true`,
      {},
      8000
    );
    let proposals = voting.proposals ?? [];
    let inVoting = true;

    // Nothing in voting → surface the latest decided proposals instead,
    // so INJI can still discuss recent governance.
    if (proposals.length === 0) {
      inVoting = false;
      const recent = await fetchJson<GovV1Response>(
        `${injective.lcd}/cosmos/gov/v1/proposals?pagination.limit=3&pagination.reverse=true`,
        {},
        8000
      );
      proposals = recent.proposals ?? [];
    }

    const withTallies = await Promise.all(
      proposals.map(async (p) => {
        let yes = 0;
        let no = 0;
        if (inVoting) {
          try {
            const t = await fetchJson<TallyResponse>(
              `${injective.lcd}/cosmos/gov/v1/proposals/${p.id}/tally`,
              {},
              6000
            );
            yes = Number(t.tally?.yes_count ?? 0);
            no =
              Number(t.tally?.no_count ?? 0) +
              Number(t.tally?.no_with_veto_count ?? 0);
          } catch {
            // tally unavailable → render 0/0 rather than failing the list
          }
        } else {
          yes = Number(p.final_tally_result?.yes_count ?? 0);
          no =
            Number(p.final_tally_result?.no_count ?? 0) +
            Number(p.final_tally_result?.no_with_veto_count ?? 0);
        }
        const total = yes + no;
        const endTime = p.voting_end_time ?? "";
        const msgContent = p.messages?.[0]?.content;
        const title = p.title || msgContent?.title || `Proposal #${p.id}`;
        const description = (p.summary || msgContent?.description || "").slice(0, 200);

        return {
          id: Number(p.id),
          title,
          description,
          status: statusLabel(p.status),
          yesPercent: total > 0 ? Math.round((yes / total) * 100) : 0,
          noPercent: total > 0 ? Math.round((no / total) * 100) : 0,
          endTime,
          urgent:
            inVoting &&
            !!endTime &&
            new Date(endTime).getTime() - Date.now() < 24 * 60 * 60 * 1000,
        } satisfies GovernanceProposal;
      })
    );

    return withTallies;
  });
}

/* ────────────────────────── Transactions ────────────────────────── */

interface ExplorerTx {
  hash?: string;
  block_timestamp?: string;
  code?: number;
  gas_fee?: { amount?: { denom?: string; amount?: string }[] };
  messages?: { type?: string; value?: Record<string, unknown> }[];
}

interface ExplorerTxResponse {
  data?: ExplorerTx[];
}

const TX_LABELS: [RegExp, string][] = [
  [/MsgSend$/, "Transfer"],
  [/MsgDelegate$/, "Staked"],
  [/MsgUndelegate$/, "Unstaked"],
  [/MsgBeginRedelegate$/, "Redelegated"],
  [/MsgWithdrawDelegatorReward$/, "Claimed Rewards"],
  [/MsgExecuteContract/, "Contract Interaction"],
  [/MsgInstantiateContract/, "Contract Deploy"],
  [/MsgVote$/, "Voted"],
  [/MsgDeposit$/, "Deposited"],
  [/Msg(Create|Cancel).*Order/, "Trade"],
  [/MsgTransfer$/, "IBC Transfer"],
];

function labelFor(type: string, value: Record<string, unknown>, address: string): string {
  for (const [re, label] of TX_LABELS) {
    if (re.test(type)) {
      if (label === "Transfer") {
        return value?.from_address === address ? "Sent" : "Received";
      }
      return label;
    }
  }
  const tail = type.split(".").pop() ?? type;
  return tail.replace(/^Msg/, "");
}

function amountFor(value: Record<string, unknown>): string {
  const amt = value?.amount;
  const coins = Array.isArray(amt) ? amt : amt ? [amt] : [];
  for (const c of coins) {
    if (c && typeof c === "object" && (c as { denom?: string }).denom === "inj") {
      const n = Number((c as { amount?: string }).amount ?? 0) / INJ_DECIMALS;
      if (Number.isFinite(n) && n > 0) return `${n.toFixed(4)} INJ`;
    }
  }
  return "—";
}

export function getTransactions(address: string, limit: number): Promise<TxData[]> {
  return cached(`chain:txs:${address}:${limit}`, 30_000, async () => {
    const res = await fetchJson<ExplorerTxResponse>(
      `${injective.explorer}/accountTxs/${address}?limit=${limit}`,
      {},
      9000
    );

    return (res.data ?? []).slice(0, limit).map((tx) => {
      const msg = tx.messages?.[0];
      const type = msg?.type ?? "unknown";
      const value = (msg?.value ?? {}) as Record<string, unknown>;
      const feeRaw = tx.gas_fee?.amount?.find((a) => a.denom === "inj")?.amount;
      const fee = feeRaw
        ? `${(Number(feeRaw) / INJ_DECIMALS).toFixed(6)} INJ`
        : "—";

      return {
        hash: tx.hash ?? "",
        type: labelFor(type, value, address),
        amount: amountFor(value),
        from: typeof value.from_address === "string" ? value.from_address : "",
        to: typeof value.to_address === "string" ? value.to_address : "",
        time: tx.block_timestamp ?? "",
        status: tx.code === 0 || tx.code === undefined ? "success" : "failed",
        fee,
      } satisfies TxData;
    });
  });
}
