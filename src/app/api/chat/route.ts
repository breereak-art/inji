import { buildSystemPrompt } from "@/lib/claude/systemPrompt";
import { parseIntent } from "@/lib/claude/intentParser";
import { BrainUserError, pickBrain, type BrainAdapter } from "@/lib/brain/types";
import { clientKey, rateLimit, rateLimitResponse } from "@/lib/server/rateLimit";
import { badRequest, isValidInjAddress } from "@/lib/server/validate";
import type { ChatStreamEvent } from "@/types/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HISTORY = 24;
const MAX_MESSAGE_CHARS = 4000;
const MAX_BODY_BYTES = 120_000;

function sse(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

async function loadBrain(): Promise<BrainAdapter> {
  switch (pickBrain()) {
    case "anthropic":
      return (await import("@/lib/brain/anthropic")).anthropicBrain;
    case "gemini":
      return (await import("@/lib/brain/gemini")).geminiBrain;
    case "groq":
      return (await import("@/lib/brain/groq")).groqBrain;
    case "claude-code":
      return (await import("@/lib/brain/claudeCode")).claudeCodeBrain;
  }
}

export async function POST(req: Request) {
  // ── Guard rails: rate limit, body size, shape ──
  const rl = rateLimit(`chat:${clientKey(req)}`, 12, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds);

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Request too large." }, { status: 413 });
  }

  let body: {
    messages?: { role?: string; content?: string }[];
    walletAddress?: string;
  };
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Request too large." }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return badRequest("Invalid JSON body.");
  }

  if (!Array.isArray(body.messages)) {
    return badRequest("Expected a messages array.");
  }

  const history = body.messages
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role,
      content:
        m.content.length > MAX_MESSAGE_CHARS
          ? m.content.slice(0, MAX_MESSAGE_CHARS)
          : m.content,
    }));

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return badRequest("Last message must be from the user.");
  }

  if (body.walletAddress !== undefined && !isValidInjAddress(body.walletAddress)) {
    return badRequest("Invalid wallet address.");
  }

  const lastMessage = history[history.length - 1].content;
  const intent = parseIntent(lastMessage);
  const walletAddress = body.walletAddress ?? null;
  const system = buildSystemPrompt(intent, walletAddress);
  const brain = await loadBrain();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const { usedSearch, toolsUsed } = await brain.run({
          system,
          history,
          walletAddress,
          emit: (event) => controller.enqueue(sse(event)),
        });
        controller.enqueue(sse({ type: "done", intent, usedSearch, toolsUsed }));
      } catch (error) {
        const message =
          error instanceof BrainUserError
            ? error.message
            : "Something went wrong reaching the INJI brain.";
        controller.enqueue(sse({ type: "error", message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
