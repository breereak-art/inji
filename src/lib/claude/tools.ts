import Anthropic from "@anthropic-ai/sdk";
import { getContractReport } from "@/lib/injective/contracts";
import {
  getBalance,
  getGas,
  getGovernance,
  getTransactions,
} from "@/lib/injective/queries";
import { getHelixTopMarkets } from "@/lib/market/helix";
import { buildMarketIntel } from "@/lib/market/sentiment";
import {
  isValidInjAccountOrContract,
  isValidInjAddress,
} from "@/lib/server/validate";
import type { TxProposal } from "@/types/chat";

export interface ToolContext {
  walletAddress: string | null;
}

const SEND_FEE_INJ = "0.00004";
// Headroom on top of the amount so the proposal never strands the fee.
const FEE_HEADROOM_INJ = 0.0001;
// Must match /api/tx/prepare exactly, or the card can never succeed.
const DECIMAL_RE = /^\d+(\.\d{1,18})?$/;
const MAX_INJ = 1_000_000;

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "get_market_intel",
    description:
      "Live INJ market read: price, 24h/7d change, RSI-14, volume trend, crypto Fear & Greed, gas, and top Helix markets. Call this for ANY trade, price, or market question and for morning briefings — never quote market numbers from memory.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_gas",
    description:
      "Current Injective gas price with a safe-to-transact recommendation. Call when the user asks about gas, fees, network congestion, or whether now is a good time to transact.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_governance",
    description:
      "Injective governance proposals currently in voting (or the latest decided ones) with tallies and end times. Call when the user asks about governance, proposals, or voting, and for morning briefings.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_helix_markets",
    description:
      "Top Helix (Injective's flagship DEX) spot markets ranked by 24h volume, with price and 24h change. Call when the user asks what's moving on Helix or about specific Injective market activity.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "How many markets to return (default 5, max 10).",
        },
      },
    },
  },
  {
    name: "get_wallet_overview",
    description:
      "The connected wallet's live INJ balance (with USD value) and its 10 most recent transactions. Call for balance checks, transaction history, wallet roasts, and morning briefings. Only useful when a wallet is connected — otherwise it returns an error telling you to ask the user to connect.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "check_contract",
    description:
      "Heuristic scam/rug screen of an Injective address: contract info, admin/upgradability, CW20/CW721 detection, impersonation and unlimited-mint flags. Call whenever the user asks if a contract, token, or NFT is safe/legit/real and you have an inj1… address. Never judge contract safety without it.",
    input_schema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description:
            "Injective inj1… account (42 chars) or contract (62 chars) address, exactly as given.",
        },
      },
      required: ["address"],
    },
  },
  {
    name: "propose_send_inj",
    description:
      "Propose an INJ transfer from the connected wallet. Call exactly once, only after the user explicitly asked to send and you know the exact amount and recipient address — never invent or autocomplete either; ask first if anything is ambiguous. The app then shows a confirmation card and handles wallet signing. This never moves funds itself and you must never claim the transaction was sent.",
    input_schema: {
      type: "object",
      properties: {
        recipient: {
          type: "string",
          description:
            "Recipient inj1… account address, exactly as the user provided it.",
        },
        amount_inj: {
          type: "string",
          description:
            'Amount in INJ as a positive decimal string, e.g. "5" or "0.25".',
        },
        memo: {
          type: "string",
          description: "Optional on-chain memo.",
        },
      },
      required: ["recipient", "amount_inj"],
    },
  },
];

export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext
): Promise<object> {
  const args = (
    input && typeof input === "object" ? input : {}
  ) as Record<string, unknown>;

  try {
    switch (name) {
      case "get_market_intel":
        return await buildMarketIntel();

      case "get_gas":
        return await getGas();

      case "get_governance":
        return await getGovernance();

      case "get_helix_markets": {
        const raw = typeof args.limit === "number" ? Math.trunc(args.limit) : 5;
        const limit = Math.min(10, Math.max(1, Number.isFinite(raw) ? raw : 5));
        return await getHelixTopMarkets(limit);
      }

      case "get_wallet_overview": {
        if (!ctx.walletAddress) {
          return {
            error: "No wallet connected — ask the user to connect first.",
          };
        }
        const [balance, recentTransactions] = await Promise.all([
          getBalance(ctx.walletAddress),
          getTransactions(ctx.walletAddress, 10),
        ]);
        return { balance, recentTransactions };
      }

      case "check_contract": {
        if (!isValidInjAccountOrContract(args.address)) {
          return {
            error:
              "Invalid Injective address — expected inj1… (42-char account or 62-char contract).",
          };
        }
        return await getContractReport(args.address);
      }

      case "propose_send_inj": {
        if (!ctx.walletAddress) {
          return { error: "No wallet connected." };
        }
        if (!isValidInjAddress(args.recipient)) {
          return {
            error:
              "Invalid recipient — expected a 42-char inj1… account address.",
          };
        }
        const amountInj =
          typeof args.amount_inj === "string" ? args.amount_inj.trim() : "";
        const amount = Number(amountInj);
        if (!DECIMAL_RE.test(amountInj) || !(amount > 0)) {
          return {
            error:
              "Invalid amount — expected a positive decimal INJ amount with at most 18 decimals.",
          };
        }
        if (amount > MAX_INJ) {
          return {
            error: `Amount exceeds the ${MAX_INJ.toLocaleString("en-US")} INJ per-transfer cap.`,
          };
        }
        const balance = await getBalance(ctx.walletAddress);
        const available = Number(balance.balance);
        if (!Number.isFinite(available) || amount + FEE_HEADROOM_INJ > available) {
          return {
            error: `Insufficient balance: wallet holds ${balance.balance} INJ, but ${amountInj} INJ plus ~${FEE_HEADROOM_INJ} INJ fee headroom is needed.`,
          };
        }
        const memo =
          typeof args.memo === "string" && args.memo.trim().length > 0
            ? args.memo.trim()
            : undefined;
        const proposal: TxProposal = {
          kind: "send",
          recipient: args.recipient,
          amountInj,
          feeInj: SEND_FEE_INJ,
          ...(memo ? { memo } : {}),
        };
        return { ok: true, proposal };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch {
    return { error: "Live data source failed — try again shortly." };
  }
}
