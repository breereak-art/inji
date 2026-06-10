import {
  createSdkMcpServer,
  query,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createToolRunner } from "@/lib/brain/shared";
import {
  BrainUserError,
  type BrainAdapter,
  type BrainResult,
  type BrainRunArgs,
  type BrainTurn,
} from "@/lib/brain/types";
import { toolDefinitions } from "@/lib/claude/tools";

const MAX_AGENT_TURNS = 8;
const SERVER_NAME = "inji";
const MCP_PREFIX = `mcp__${SERVER_NAME}__`;

const INJI_TOOL_NAMES = [
  "get_market_intel",
  "get_gas",
  "get_governance",
  "get_helix_markets",
  "get_wallet_overview",
  "check_contract",
  "propose_send_inj",
] as const;

const UNAVAILABLE_MSG =
  'Local Claude Code brain unavailable — make sure Claude Code is installed and logged in (run "claude" once in a terminal), or switch INJI_BRAIN.';

type ToolRunner = ReturnType<typeof createToolRunner>;

/** Reuse the exact tool descriptions the Anthropic brain ships to the model. */
function describeTool(name: string): string {
  return toolDefinitions.find((t) => t.name === name)?.description ?? name;
}

/**
 * Expose INJI's 7 tools as an in-process SDK MCP server. Every handler goes
 * through the shared runTool so status narration and the single-tx-proposal
 * guard behave identically across brains.
 */
function buildInjiServer(runTool: ToolRunner) {
  const handle = (name: string) => async (input: unknown) => ({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(await runTool(name, input)),
      },
    ],
  });

  return createSdkMcpServer({
    name: SERVER_NAME,
    version: "1.0.0",
    tools: [
      tool(
        "get_market_intel",
        describeTool("get_market_intel"),
        {},
        handle("get_market_intel")
      ),
      tool("get_gas", describeTool("get_gas"), {}, handle("get_gas")),
      tool(
        "get_governance",
        describeTool("get_governance"),
        {},
        handle("get_governance")
      ),
      tool(
        "get_helix_markets",
        describeTool("get_helix_markets"),
        {
          limit: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe("How many markets to return (default 5, max 10)."),
        },
        handle("get_helix_markets")
      ),
      tool(
        "get_wallet_overview",
        describeTool("get_wallet_overview"),
        {},
        handle("get_wallet_overview")
      ),
      tool(
        "check_contract",
        describeTool("check_contract"),
        {
          address: z
            .string()
            .describe(
              "Injective inj1… account (42 chars) or contract (62 chars) address, exactly as given."
            ),
        },
        handle("check_contract")
      ),
      tool(
        "propose_send_inj",
        describeTool("propose_send_inj"),
        {
          recipient: z
            .string()
            .describe(
              "Recipient inj1… account address, exactly as the user provided it."
            ),
          amount_inj: z
            .string()
            .describe(
              'Amount in INJ as a positive decimal string, e.g. "5" or "0.25".'
            ),
          memo: z.string().optional().describe("Optional on-chain memo."),
        },
        handle("propose_send_inj")
      ),
    ],
  });
}

/**
 * The Agent SDK is session-based; INJI replays stateless chat. Fold prior
 * turns into a compact transcript block ahead of the new message.
 */
function buildPrompt(history: BrainTurn[]): string {
  const last = history[history.length - 1];
  const lastText = last?.content ?? "";
  if (history.length <= 1) return lastText;

  const transcript = history
    .slice(0, -1)
    .map((t) => `${t.role === "user" ? "User" : "INJI"}: ${t.content}`)
    .join("\n");

  return `Previous conversation:\n${transcript}\n\nUser's new message: ${lastText}`;
}

/**
 * INJI brain backed by the user's local Claude Code subscription via the
 * Agent SDK — no API key, no per-token cost. Dev-machine only.
 */
export const claudeCodeBrain: BrainAdapter = {
  name: "claude-code",

  async run({
    system,
    history,
    walletAddress,
    emit,
  }: BrainRunArgs): Promise<BrainResult> {
    const runTool = createToolRunner(walletAddress, emit);
    const injiServer = buildInjiServer(runTool);

    // CRITICAL: this app sets ANTHROPIC_API_KEY but the key has NO credits.
    // The Options.env value REPLACES the child env entirely (verified in
    // sdk.mjs: `yt ? {...yt} : {...process.env}`), so a copied env with the
    // key deleted forces the CLI onto the subscription login.
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    let usedSearch = false;
    const toolsUsed: string[] = [];
    let textEmitted = false;
    let needSeparator = false;

    try {
      const stream = query({
        prompt: buildPrompt(history),
        options: {
          // Plain string REPLACES the CLI's default system prompt.
          systemPrompt: system,
          model: "sonnet",
          maxTurns: MAX_AGENT_TURNS,
          env,
          mcpServers: { [SERVER_NAME]: injiServer },
          // Ignore project .mcp.json / user MCP config entirely.
          strictMcpConfig: true,
          // Base built-in tool set: web search only — INJI must never touch
          // the user's machine (no Bash/Read/Write/Edit/file tools).
          tools: ["WebSearch"],
          allowedTools: [
            "WebSearch",
            ...INJI_TOOL_NAMES.map((n) => `${MCP_PREFIX}${n}`),
          ],
          disallowedTools: [
            "Bash",
            "Read",
            "Write",
            "Edit",
            "Glob",
            "Grep",
            "WebFetch",
            "NotebookEdit",
            "Task",
          ],
          // Auto-allow allowedTools, silently deny everything else — never
          // block on an interactive permission prompt.
          permissionMode: "dontAsk",
          // [] = SDK isolation mode: no settings.json, no CLAUDE.md.
          settingSources: [],
          // Stateless replay — don't litter ~/.claude/projects with sessions.
          persistSession: false,
          includePartialMessages: true,
        },
      });

      for await (const message of stream) {
        if (message.type === "stream_event") {
          if (message.parent_tool_use_id) continue; // subagent chatter
          const event = message.event;
          if (event.type === "message_start") {
            // separate this assistant burst's prose from the previous one
            needSeparator = textEmitted;
          } else if (
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
          continue;
        }

        if (message.type === "assistant") {
          if (
            message.error === "authentication_failed" ||
            message.error === "oauth_org_not_allowed" ||
            message.error === "billing_error"
          ) {
            throw new BrainUserError(UNAVAILABLE_MSG);
          }
          for (const block of message.message.content) {
            if (block.type !== "tool_use" && block.type !== "server_tool_use") {
              continue;
            }
            const name: string = block.name;
            if (name === "WebSearch" || name === "web_search") {
              usedSearch = true;
              emit({ type: "status", text: "Checking live sources…" });
            } else if (name.startsWith(MCP_PREFIX)) {
              toolsUsed.push(name.slice(MCP_PREFIX.length));
            }
          }
          continue;
        }

        if (message.type === "result") {
          if (message.subtype !== "success") {
            const detail = message.errors.join(" ");
            if (/auth|log ?in|api key|credit/i.test(detail)) {
              throw new BrainUserError(UNAVAILABLE_MSG);
            }
            if (message.subtype === "error_max_turns") {
              throw new BrainUserError(
                "The local brain hit its turn limit before finishing — try a simpler request."
              );
            }
            throw new BrainUserError(
              "Local Claude Code brain failed mid-run — try again or switch INJI_BRAIN."
            );
          }
          break; // result ends the run
        }
      }
    } catch (error) {
      if (error instanceof BrainUserError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      // SDK process-start / early-exit failures (auth failures exit the CLI).
      if (
        /failed to spawn claude code|claude code process exited|enoent/i.test(
          msg
        )
      ) {
        throw new BrainUserError(UNAVAILABLE_MSG);
      }
      throw error;
    }

    return { usedSearch, toolsUsed };
  },
};
