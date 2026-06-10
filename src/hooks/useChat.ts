"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatMessage, ChatStreamEvent, TxProposal } from "@/types/chat";

let idCounter = 0;
const nextId = () => `msg_${Date.now()}_${idCounter++}`;

export function useChat({ walletAddress }: { walletAddress?: string | null } = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || busyRef.current) return;
      busyRef.current = true;

      const userMessage: ChatMessage = {
        id: nextId(),
        role: "user",
        content: trimmed,
      };
      const outgoing = [...messages, userMessage];

      setMessages(outgoing);
      setStreaming(true);
      setStreamingContent("");
      setStatus(null);
      setError(null);

      let assembled = "";
      let proposal: TxProposal | undefined;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: outgoing.map(({ role, content }) => ({ role, content })),
            ...(walletAddress ? { walletAddress } : {}),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? `Request failed (${res.status})`);
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let event: ChatStreamEvent;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (event.type === "text") {
              assembled += event.text;
              setStatus(null);
              setStreamingContent(assembled);
            } else if (event.type === "status") {
              setStatus(event.text);
            } else if (event.type === "tx_proposal") {
              proposal = event.proposal;
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          }
        }

        if (assembled || proposal) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId(),
              role: "assistant",
              content: assembled,
              ...(proposal ? { proposal } : {}),
            },
          ]);
        }
      } catch (err) {
        // keep whatever partial response arrived before the failure
        if (assembled) {
          setMessages((prev) => [
            ...prev,
            { id: nextId(), role: "assistant", content: assembled },
          ]);
        }
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setStreamingContent("");
        setStatus(null);
        setStreaming(false);
        busyRef.current = false;
      }
    },
    [messages, walletAddress]
  );

  /** Push an assistant message without a round-trip (e.g. post-broadcast summary). */
  const appendLocalAssistant = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "assistant", content },
    ]);
  }, []);

  return {
    messages,
    streaming,
    streamingContent,
    status,
    error,
    sendMessage,
    appendLocalAssistant,
  };
}
