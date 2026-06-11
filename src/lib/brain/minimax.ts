import { createToolRunner } from "@/lib/brain/shared";
import { toolDefinitions } from "@/lib/claude/tools";
import {
  BrainUserError,
  type BrainAdapter,
  type BrainResult,
  type BrainRunArgs,
} from "@/lib/brain/types";

const MAX_AGENT_TURNS = 6;

interface OpenAiToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
}

interface MinimaxResponse {
  choices?: { message?: OpenAiMessage }[];
  error?: { message?: string };
}

const openAiTools = toolDefinitions.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

/** INJI brain on MiniMax-M3 (OpenAI-compatible). */
export const minimaxBrain: BrainAdapter = {
  name: "minimax",

  async run({ system, history, walletAddress, emit }: BrainRunArgs): Promise<BrainResult> {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw new BrainUserError(
        "MINIMAX_API_KEY is not configured — get a key from the MiniMax platform."
      );
    }
    const baseUrl =
      (process.env.MINIMAX_BASE_URL ?? "https://api.minimax.chat/v1").replace(/\/$/, "");
    const url = `${baseUrl}/chat/completions`;
    const model = process.env.MINIMAX_MODEL || "MiniMax-M3";

    const userMessages = history.filter((t) => t.role === "user").map((t) => t.content);
    const runTool = createToolRunner(walletAddress, emit, userMessages);
    const toolsUsed: string[] = [];
    let textEmitted = false;

    const messages: OpenAiMessage[] = [
      { role: "system", content: system },
      ...history.map((t) => ({ role: t.role, content: t.content })),
    ];

    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            tools: openAiTools,
            tool_choice: "auto",
            max_tokens: 4096,
          }),
        });
        if (res.status !== 429 || attempt === 2) break;
        const waitSec = Math.min(20, Number(res.headers.get("retry-after")) || 8);
        emit({ type: "status", text: "Thinking…" });
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      }
      if (!res) throw new BrainUserError("MiniMax request failed — try again.");

      if (res.status === 401 || res.status === 403) {
        throw new BrainUserError("Invalid MINIMAX_API_KEY — check your key.");
      }
      if (res.status === 429) {
        throw new BrainUserError("MiniMax is rate-limited right now — try again shortly.");
      }
      if (!res.ok) {
        throw new BrainUserError(`MiniMax API error (${res.status}) — try again shortly.`);
      }

      const data = (await res.json()) as MinimaxResponse;
      const message = data.choices?.[0]?.message;
      if (!message) {
        throw new BrainUserError("MiniMax returned an empty response — try again.");
      }

      if (typeof message.content === "string" && message.content.trim()) {
        if (textEmitted) emit({ type: "text", text: "\n\n" });
        textEmitted = true;
        emit({ type: "text", text: message.content });
      }

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) break;

      messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        toolsUsed.push(call.function.name);
        let input: unknown = {};
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          // malformed args — let the tool report the error
        }
        const result = await runTool(call.function.name, input);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    return { usedSearch: false, toolsUsed };
  },
};
