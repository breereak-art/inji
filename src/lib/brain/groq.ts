import { createToolRunner } from "@/lib/brain/shared";
import { toolDefinitions } from "@/lib/claude/tools";
import {
  BrainUserError,
  type BrainAdapter,
  type BrainResult,
  type BrainRunArgs,
} from "@/lib/brain/types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
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

interface GroqResponse {
  choices?: { message?: OpenAiMessage }[];
  error?: { message?: string };
}

/** Anthropic tool defs → OpenAI function format (same JSON Schema inside). */
const openAiTools = toolDefinitions.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

/** INJI brain on Groq's free tier (Llama, OpenAI-compatible API). */
export const groqBrain: BrainAdapter = {
  name: "groq",

  async run({ system, history, walletAddress, emit }: BrainRunArgs): Promise<BrainResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new BrainUserError(
        "GROQ_API_KEY is not configured — get a free key at console.groq.com."
      );
    }
    const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    const runTool = createToolRunner(walletAddress, emit);
    const toolsUsed: string[] = [];
    let textEmitted = false;

    const messages: OpenAiMessage[] = [
      { role: "system", content: system },
      ...history.map((t) => ({ role: t.role, content: t.content })),
    ];

    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      let res: Response | null = null;
      // free-tier TPM limits reset quickly — honor retry-after up to twice
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(GROQ_URL, {
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
        const waitSec = Math.min(
          20,
          Number(res.headers.get("retry-after")) || 8
        );
        emit({ type: "status", text: "Catching my breath (free tier)…" });
        await new Promise((r) => setTimeout(r, waitSec * 1000));
      }
      if (!res) throw new BrainUserError("Groq request failed — try again.");

      if (res.status === 401 || res.status === 403) {
        throw new BrainUserError("Invalid GROQ_API_KEY — check your key from console.groq.com.");
      }
      if (res.status === 429) {
        throw new BrainUserError(
          "Groq free tier is rate-limited right now — wait a few seconds and try again."
        );
      }
      if (!res.ok) {
        throw new BrainUserError(`Groq API error (${res.status}) — try again shortly.`);
      }

      const data = (await res.json()) as GroqResponse;
      const message = data.choices?.[0]?.message;
      if (!message) {
        throw new BrainUserError("Groq returned an empty response — try again.");
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
          // malformed arguments — let the tool report the validation error
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
