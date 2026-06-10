"use client";

import Link from "next/link";
import { useState } from "react";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { SignalScene } from "@/components/canvas/SignalField";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { injective } from "@/lib/injective/endpoints";

export default function ChatPage() {
  const [streaming, setStreaming] = useState(false);

  return (
    <WalletProvider>
      <div className="flex h-svh flex-col bg-void">
        {/* ambient signal field, pulses while INJI is responding */}
        <SignalScene
          pulse={streaming}
          className="pointer-events-none fixed inset-0 z-0 opacity-40"
        />

        <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b border-dim bg-void/60 px-6 backdrop-blur-xl">
          <div className="flex items-baseline gap-3">
            <Link
              href="/"
              className="font-display text-[16px] font-extrabold tracking-tight text-white"
            >
              INJI
            </Link>
            <span className="font-mono text-[10px] tracking-[0.18em] text-txt-tertiary">
              TERMINAL
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-2 font-mono text-[11px] text-txt-secondary sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-green)]" />
              {injective.chainId}
            </span>
            <ConnectButton />
          </div>
        </header>

        <main className="relative min-h-0 flex-1">
          <ChatInterface onStreamingChange={setStreaming} />
        </main>
      </div>
    </WalletProvider>
  );
}
