import { createToolRunner } from "@/lib/brain/shared";
import { toolDefinitions } from "@/lib/claude/tools";
import {
  BrainUserError,
  type BrainAdapter,
  type BrainResult,
  type BrainRunArgs,
} from "@/lib/brain/types";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
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

interface NvidiaResponse {
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

/** INJI brain on NVIDIA NIM (OpenAI-compatible). */
export const nvidiaBrain: BrainAdapter = {
  name: "nvidia",

  async run({ system, history, walletAddress, emit }: BrainRunArgs): Promise<BrainResult> {
    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
      throw new BrainUserError(
        "NVIDIA_API_KEY is not configured — get a free key at build.nvidia.com."
      );
    }
    const model = process.env.NVIDIA_MODEL || "qwen/qwen3.5-122b-a10b";

    const userMessages = history.filter((t) => t.role === "user").map((t) => t.content);
    const runTool = createToolRunner(walletAddress, emit, userMessages);
    const toolsUsed: string[] = [];
    let textEmitted = false;

    const messages: OpenAiMessage[] = [
      { role: "system", content: system },
      ...history.map((t) => ({ role: t.role, content: t.content })),
    ];

    // Strip null values — NVIDIA's Qwen rejects null fields (e.g. content:null on tool-call turns)
    const buildBody = () =>
      JSON.stringify(
        {
          model,
          messages,
          tools: openAiTools,
          tool_choice: "auto",
          max_tokens: 4096,
          temperature: 0.6,
          top_p: 0.95,
        },
        (_, v) => (v === null ? undefined : v)
      );

    for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
      // NVIDIA NIM intermittently 500s ("invalid type: unit variant…") or returns an
      // empty completion on identical payloads — retry transient failures.
      let message: OpenAiMessage | null = null;
      let lastError = "";
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await fetch(NVIDIA_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: buildBody(),
        });

        if (res.status === 401 || res.status === 403) {
          throw new BrainUserError("Invalid NVIDIA_API_KEY — check your key at build.nvidia.com.");
        }
        if (res.status === 429) {
          const waitSec = Math.min(20, Number(res.headers.get("retry-after")) || 8);
          lastError = "NVIDIA NIM is rate-limited right now — try again shortly.";
          emit({ type: "status", text: "Thinking…" });
          await new Promise((r) => setTimeout(r, waitSec * 1000));
          continue;
        }
        if (res.status >= 500) {
          const errBody = await res.text().catch(() => "");
          lastError = `NVIDIA API error (${res.status}): ${errBody.slice(0, 300)}`;
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new BrainUserError(`NVIDIA API error (${res.status}): ${errBody.slice(0, 300)}`);
        }

        const data = (await res.json()) as NvidiaResponse;
        const candidate = data.choices?.[0]?.message;
        const hasContent =
          typeof candidate?.content === "string" && candidate.content.trim().length > 0;
        const hasToolCalls = (candidate?.tool_calls?.length ?? 0) > 0;
        if (!candidate || (!hasContent && !hasToolCalls)) {
          lastError = "NVIDIA returned an empty response — try again.";
          continue;
        }
        message = candidate;
        break;
      }
      if (!message) {
        throw new BrainUserError(lastError || "NVIDIA request failed — try again.");
      }

      if (typeof message.content === "string" && message.content.trim()) {
        if (textEmitted) emit({ type: "text", text: "\n\n" });
        textEmitted = true;
        emit({ type: "text", text: message.content });
      }

      const toolCalls = message.tool_calls ?? [];
      if (toolCalls.length === 0) break;

      // NVIDIA rejects content:null — omit the field when empty
      const assistantMsg: Record<string, unknown> = { role: "assistant", tool_calls: toolCalls };
      if (message.content) assistantMsg.content = message.content;
      messages.push(assistantMsg as unknown as OpenAiMessage);

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
