import {
  ApiError,
  BlockedReason,
  FinishReason,
  GoogleGenAI,
  Type,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type Part,
  type PartListUnion,
  type Schema,
} from "@google/genai";
import type Anthropic from "@anthropic-ai/sdk";
import { toolDefinitions } from "@/lib/claude/tools";
import { createToolRunner } from "@/lib/brain/shared";
import {
  BrainUserError,
  type BrainAdapter,
  type BrainResult,
  type BrainRunArgs,
} from "@/lib/brain/types";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_AGENT_TURNS = 6;

const TYPE_MAP: Record<string, Type> = {
  object: Type.OBJECT,
  string: Type.STRING,
  integer: Type.INTEGER,
  number: Type.NUMBER,
  boolean: Type.BOOLEAN,
  array: Type.ARRAY,
};

/** Convert one Anthropic JSON-schema node to Gemini's OpenAPI-subset Schema. */
function toGeminiSchema(jsonSchema: unknown): Schema {
  const node = (
    jsonSchema && typeof jsonSchema === "object" ? jsonSchema : {}
  ) as Record<string, unknown>;

  const schema: Schema = {};
  if (typeof node.type === "string" && TYPE_MAP[node.type]) {
    schema.type = TYPE_MAP[node.type];
  }
  if (typeof node.description === "string") {
    schema.description = node.description;
  }
  if (typeof node.minimum === "number") schema.minimum = node.minimum;
  if (typeof node.maximum === "number") schema.maximum = node.maximum;
  if (Array.isArray(node.enum)) {
    schema.enum = node.enum.map(String);
  }
  if (node.properties && typeof node.properties === "object") {
    const properties: Record<string, Schema> = {};
    for (const [key, value] of Object.entries(
      node.properties as Record<string, unknown>
    )) {
      properties[key] = toGeminiSchema(value);
    }
    schema.properties = properties;
  }
  if (Array.isArray(node.required)) {
    schema.required = node.required.filter(
      (item): item is string => typeof item === "string"
    );
  }
  if (node.items && typeof node.items === "object") {
    schema.items = toGeminiSchema(node.items);
  }
  return schema;
}

/** Map INJI's Anthropic-format tool definitions to Gemini FunctionDeclarations. */
function toFunctionDeclarations(
  tools: Anthropic.Tool[]
): FunctionDeclaration[] {
  return tools.map((tool) => {
    const parameters = toGeminiSchema(tool.input_schema);
    const hasProperties =
      parameters.properties && Object.keys(parameters.properties).length > 0;
    return {
      name: tool.name,
      description: tool.description,
      // Gemini rejects empty OBJECT parameter schemas; omit for no-arg tools.
      ...(hasProperties ? { parameters } : {}),
    };
  });
}

/** Free-tier deploy brain: Google Gemini agent loop (no web search). */
export const geminiBrain: BrainAdapter = {
  name: "gemini",

  async run({ system, history, walletAddress, emit }: BrainRunArgs): Promise<BrainResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BrainUserError(
        "GEMINI_API_KEY is not configured — get a free key at aistudio.google.com/apikey."
      );
    }

    const client = new GoogleGenAI({ apiKey });
    const runTool = createToolRunner(walletAddress, emit);
    const toolsUsed: string[] = [];

    const turns = history.filter((turn) => turn.content.trim().length > 0);
    const lastTurn = turns.pop();
    if (!lastTurn) {
      throw new BrainUserError("Say something first — there's nothing to answer yet.");
    }

    const priorContents: Content[] = turns.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    }));

    try {
      const chat = client.chats.create({
        model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
        config: {
          systemInstruction: system,
          maxOutputTokens: 8000,
          tools: [{ functionDeclarations: toFunctionDeclarations(toolDefinitions) }],
        },
        history: priorContents,
      });

      let message: PartListUnion = lastTurn.content;
      let textEmitted = false;

      for (let turn = 0; turn < MAX_AGENT_TURNS; turn++) {
        // separate this turn's prose from the previous turn's
        let needSeparator = textEmitted;
        let blocked = false;
        let sawContent = false;
        const calls: FunctionCall[] = [];

        const stream = await chat.sendMessageStream({ message });

        for await (const chunk of stream) {
          const blockReason = chunk.promptFeedback?.blockReason;
          if (
            blockReason !== undefined &&
            blockReason !== BlockedReason.BLOCKED_REASON_UNSPECIFIED
          ) {
            blocked = true;
          }

          const candidate = chunk.candidates?.[0];
          if (candidate?.finishReason === FinishReason.SAFETY) blocked = true;

          for (const part of candidate?.content?.parts ?? []) {
            if (part.thought) continue;
            if (typeof part.text === "string" && part.text.length > 0) {
              sawContent = true;
              if (needSeparator) {
                emit({ type: "text", text: "\n\n" });
                needSeparator = false;
              }
              textEmitted = true;
              emit({ type: "text", text: part.text });
            }
            if (part.functionCall) {
              sawContent = true;
              calls.push(part.functionCall);
            }
          }
        }

        if (blocked || !sawContent) {
          throw new BrainUserError(
            "Gemini declined to answer that one — try rephrasing."
          );
        }

        if (calls.length === 0) break;

        const responseParts: Part[] = [];
        for (const call of calls) {
          const name = call.name ?? "";
          toolsUsed.push(name);
          const result = await runTool(name, call.args ?? {});
          responseParts.push({
            functionResponse: {
              ...(call.id ? { id: call.id } : {}),
              name,
              response: { output: result },
            },
          });
        }
        message = responseParts;
      }
    } catch (error) {
      if (error instanceof BrainUserError) throw error;
      if (error instanceof ApiError) {
        if (error.status === 429 || error.message.includes("RESOURCE_EXHAUSTED")) {
          throw new BrainUserError(
            "Gemini free tier is rate-limited right now — wait a few seconds and try again."
          );
        }
        if (
          (error.status === 400 || error.status === 401 || error.status === 403) &&
          /API_KEY_INVALID|API key not valid|API key expired/i.test(error.message)
        ) {
          throw new BrainUserError(
            "Invalid GEMINI_API_KEY — check your key from aistudio.google.com."
          );
        }
      }
      throw error;
    }

    return { usedSearch: false, toolsUsed };
  },
};
