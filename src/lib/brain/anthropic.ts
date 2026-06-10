import Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions } from "@/lib/claude/tools";
import { createToolRunner } from "@/lib/brain/shared";
import {
  BrainUserError,
  type BrainAdapter,
  type BrainResult,
  type BrainRunArgs,
} from "@/lib/brain/types";

const MODEL = "claude-sonnet-4-6";
const MAX_AGENT_TURNS = 6;

/** The original INJI brain: Anthropic API agent loop with web search. */
export const anthropicBrain: BrainAdapter = {
  name: "anthropic",

  async run({ system, history, walletAddress, emit }: BrainRunArgs): Promise<BrainResult> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new BrainUserError(
        "ANTHROPIC_API_KEY is not configured. Add it to .env.local and restart the dev server."
      );
    }

    const client = new Anthropic();
    const runTool = createToolRunner(walletAddress, emit);
    let usedSearch = false;
    const toolsUsed: string[] = [];

    try {
      const messages: Anthropic.MessageParam[] = [...history];
      let textEmitted = false;

      for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
        // separate this turn's prose from the previous turn's
        let needSeparator = textEmitted;

        const messageStream = client.messages.stream({
          model: MODEL,
          max_tokens: 8000,
          system,
          tools: [
            ...toolDefinitions,
            { type: "web_search_20260209", name: "web_search", max_uses: 3 },
          ],
          messages,
        });

        for await (const event of messageStream) {
          if (
            event.type === "content_block_start" &&
            event.content_block.type === "server_tool_use"
          ) {
            usedSearch = true;
            emit({ type: "status", text: "Checking live sources…" });
          }
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            if (needSeparator) {
              emit({ type: "text", text: "\n\n" });
              needSeparator = false;
            }
            textEmitted = true;
            emit({ type: "text", text: event.delta.text });
          }
        }

        const final = await messageStream.finalMessage();
        messages.push({ role: "assistant", content: final.content });

        // web_search can pause a long turn; resume it as-is
        if (final.stop_reason === "pause_turn") continue;

        if (final.stop_reason !== "tool_use") break;

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of final.content) {
          if (block.type !== "tool_use") continue;
          toolsUsed.push(block.name);
          const result = await runTool(block.name, block.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }

        messages.push({ role: "user", content: toolResults });
      }
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new BrainUserError("Invalid ANTHROPIC_API_KEY — check .env.local.");
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new BrainUserError("Rate limited by the Claude API. Give it a moment.");
      }
      if (error instanceof Anthropic.APIError) {
        throw new BrainUserError(
          /credit balance/i.test(String(error.message))
            ? "The Anthropic account is out of API credits — add credits at console.anthropic.com → Plans & Billing, then try again."
            : `Claude API error (${error.status}).`
        );
      }
      throw error;
    }

    return { usedSearch, toolsUsed };
  },
};
