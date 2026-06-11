import type { ChatStreamEvent } from "@/types/chat";

export interface BrainTurn {
  role: "user" | "assistant";
  content: string;
}

export interface BrainRunArgs {
  system: string;
  history: BrainTurn[];
  walletAddress: string | null;
  /** Emit SSE events as the brain works: text / status / tx_proposal only. */
  emit: (event: ChatStreamEvent) => void;
}

export interface BrainResult {
  usedSearch: boolean;
  toolsUsed: string[];
}

/** One INJI "brain" — a model provider that runs the agentic answer loop. */
export interface BrainAdapter {
  name: string;
  run(args: BrainRunArgs): Promise<BrainResult>;
}

/** Thrown by adapters when the message is safe to show the user verbatim. */
export class BrainUserError extends Error {}

export type BrainKind = "anthropic" | "claude-code" | "gemini" | "groq" | "minimax" | "nvidia";

/**
 * Explicit INJI_BRAIN wins; otherwise prefer the Anthropic API when a key is
 * configured, then Gemini, then Groq, then MiniMax, then NVIDIA, then the local Claude Code subscription.
 */
export function pickBrain(): BrainKind {
  const explicit = process.env.INJI_BRAIN;
  if (
    explicit === "anthropic" ||
    explicit === "claude-code" ||
    explicit === "gemini" ||
    explicit === "groq" ||
    explicit === "minimax" ||
    explicit === "nvidia"
  ) {
    return explicit;
  }
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.MINIMAX_API_KEY) return "minimax";
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  return "claude-code";
}
