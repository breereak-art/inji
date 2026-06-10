"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import { useWallet } from "@/components/wallet/WalletProvider";
import { Markdown } from "@/components/chat/Markdown";
import { TxConfirmCard } from "@/components/chat/TxConfirmCard";
import { cn } from "@/lib/utils/cn";

const SUGGESTIONS = [
  ["☀", "Morning Brief", "Give me my morning brief"],
  ["🎯", "Buy Check", "Can I buy INJ right now? Give me your honest read."],
  ["🛡", "Scam Check", "I want to check if a token contract is a scam"],
  ["⛽", "Gas Check", "Is gas safe right now?"],
  ["🏛", "Governance", "Any governance proposals I should care about?"],
  ["🔥", "Roast My Wallet", "Roast my wallet"],
] as const;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late night.";
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
}

export function ChatInterface({
  onStreamingChange,
}: {
  onStreamingChange?: (streaming: boolean) => void;
}) {
  const { address } = useWallet();
  const {
    messages,
    streaming,
    streamingContent,
    status,
    error,
    sendMessage,
    appendLocalAssistant,
  } = useChat({ walletAddress: address });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onStreamingChange?.(streaming);
  }, [streaming, onStreamingChange]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamingContent, status, streaming]);

  const submit = () => {
    if (!input.trim() || streaming) return;
    sendMessage(input);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const empty = messages.length === 0;

  return (
    <div className="relative z-10 flex h-full flex-col">
      {/* ── Thread ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[720px] px-6 pb-8 pt-10">
          {empty ? (
            <div className="flex min-h-[55vh] flex-col items-start justify-end">
              <h1 className="rise rise-1 font-display text-[clamp(34px,5vw,46px)] font-extrabold tracking-[-0.025em] text-white">
                {greeting()}
              </h1>
              <p className="rise rise-2 mt-3 max-w-[420px] text-[15px] leading-relaxed text-txt-secondary">
                Ask about Injective — markets, gas, governance, your wallet.
                I&apos;ll check the chain and live sources before I answer.
              </p>
              <div className="rise rise-3 mt-9 flex flex-wrap gap-2.5">
                {SUGGESTIONS.map(([icon, label, prompt]) => (
                  <button
                    key={label}
                    onClick={() => sendMessage(prompt)}
                    className="flex items-center gap-2 rounded-full border border-subtle bg-surface/60 px-4 py-2 text-[13px] text-txt-secondary transition-all duration-150 hover:border-accent hover:text-white active:scale-[0.97]"
                  >
                    <span className="text-[12px]">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[78%] rounded-2xl rounded-br-md border border-subtle bg-elevated px-4 py-2.5 text-[14px] leading-relaxed text-white">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="max-w-[92%]">
                    <p className="mb-2 font-mono text-[10px] tracking-[0.16em] text-txt-tertiary">
                      INJI
                    </p>
                    {m.content && <Markdown content={m.content} />}
                    {m.proposal && (
                      <TxConfirmCard
                        proposal={m.proposal}
                        onDone={appendLocalAssistant}
                      />
                    )}
                  </div>
                )
              )}

              {streaming && (
                <div className="max-w-[92%]">
                  <p className="mb-2 font-mono text-[10px] tracking-[0.16em] text-txt-tertiary">
                    INJI
                  </p>
                  {streamingContent ? (
                    <div>
                      <Markdown content={streamingContent} />
                      <span className="stream-caret" />
                    </div>
                  ) : status ? (
                    <p className="text-[13px] italic text-txt-secondary">
                      {status}
                    </p>
                  ) : (
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-[13px] text-[#fca5a5]">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Input ── */}
      <div className="px-6 pb-5">
        <div className="mx-auto w-full max-w-[720px]">
          <div
            className={cn(
              "flex items-end gap-3 rounded-2xl border bg-surface/80 px-4 py-3 backdrop-blur-xl transition-colors duration-200",
              streaming ? "border-dim" : "border-subtle focus-within:border-accent"
            )}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 144)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Ask INJI anything about Injective…"
              className="max-h-36 flex-1 resize-none bg-transparent text-[15px] text-white caret-inj-cyan outline-none placeholder:text-txt-tertiary"
            />
            <button
              onClick={submit}
              disabled={!input.trim() || streaming}
              aria-label="Send"
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-150",
                input.trim() && !streaming
                  ? "bg-white text-black hover:scale-105 active:scale-95"
                  : "bg-elevated text-txt-tertiary"
              )}
            >
              <ArrowUp size={16} strokeWidth={2.5} />
            </button>
          </div>
          <p className="mt-3 text-center font-mono text-[10px] tracking-[0.12em] text-txt-tertiary">
            INJI NEVER HOLDS YOUR KEYS · TRANSACTIONS ARE SIGNED IN YOUR WALLET
          </p>
        </div>
      </div>
    </div>
  );
}
