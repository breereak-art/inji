import { executeTool } from "@/lib/claude/tools";
import type { ChatStreamEvent, TxProposal } from "@/types/chat";

export const TOOL_STATUS: Record<string, string> = {
  get_market_intel: "Reading the market…",
  get_gas: "Checking gas…",
  get_governance: "Checking governance…",
  get_helix_markets: "Scanning Helix…",
  get_wallet_overview: "Looking at your wallet…",
  check_contract: "Inspecting the contract…",
  propose_send_inj: "Preparing the transaction…",
};

/**
 * Wraps executeTool with the per-request rules every brain must honor:
 * status narration, and at most ONE emitted tx proposal per message
 * (the UI renders exactly one confirm card).
 */
export function createToolRunner(
  walletAddress: string | null,
  emit: (event: ChatStreamEvent) => void,
  userMessages: string[] = []
) {
  let proposalEmitted = false;

  return async function runTool(
    name: string,
    input: unknown
  ): Promise<object> {
    emit({ type: "status", text: TOOL_STATUS[name] ?? "Working…" });

    let result = await executeTool(name, input, { walletAddress, userMessages });

    if (name === "propose_send_inj") {
      const r = result as { ok?: boolean; proposal?: TxProposal };
      if (r.ok && r.proposal) {
        if (proposalEmitted) {
          result = {
            error:
              "Only one send can be proposed per message — ask the user to confirm the first transfer before proposing another.",
          };
        } else {
          proposalEmitted = true;
          emit({ type: "tx_proposal", proposal: r.proposal });
        }
      }
    }

    return result;
  };
}
