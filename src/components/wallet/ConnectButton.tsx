"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, LogOut } from "lucide-react";
import {
  detectWallets,
  useWallet,
  type WalletKind,
} from "@/components/wallet/WalletProvider";
import { truncateAddress } from "@/lib/wallet/address";
import { injective } from "@/lib/injective/endpoints";
import { cn } from "@/lib/utils/cn";

const WALLETS: { kind: WalletKind; label: string; installUrl: string }[] = [
  { kind: "keplr", label: "Keplr", installUrl: "https://keplr.app/download" },
  { kind: "leap", label: "Leap", installUrl: "https://leapwallet.io/download" },
  {
    kind: "metamask",
    label: "MetaMask",
    installUrl: "https://metamask.io/download",
  },
];

export function ConnectButton() {
  const { status, address, balance, error, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [available, setAvailable] = useState<Record<WalletKind, boolean>>({
    keplr: false,
    leap: false,
    metamask: false,
  });
  const rootRef = useRef<HTMLDivElement>(null);

  // extensions inject after hydration — detect on open, not at render time
  useEffect(() => {
    if (open) setAvailable(detectWallets());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing to recover
    }
  };

  if (status === "connected" && address) {
    return (
      <div ref={rootRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-full border border-subtle bg-surface/60 px-4 py-1.5 transition-colors duration-150 hover:border-accent"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-green)]" />
          <span className="font-mono text-[12px] text-white">
            {truncateAddress(address)}
          </span>
          {balance !== null && (
            <span className="hidden font-mono text-[11px] text-txt-secondary sm:inline">
              {balance} INJ
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-subtle bg-elevated/95 shadow-2xl backdrop-blur-xl">
            <button
              onClick={copyAddress}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-[13px] text-txt-secondary transition-colors hover:bg-surface hover:text-white"
            >
              {copied ? (
                <Check size={14} className="text-[var(--status-green)]" />
              ) : (
                <Copy size={14} />
              )}
              {copied ? "Copied" : "Copy address"}
            </button>
            <a
              href={`${injective.explorerAccountUrl}${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-4 py-3 text-[13px] text-txt-secondary transition-colors hover:bg-surface hover:text-white"
            >
              View on explorer ↗
            </a>
            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 border-t border-dim px-4 py-3 text-left text-[13px] text-txt-secondary transition-colors hover:bg-surface hover:text-white"
            >
              <LogOut size={14} />
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => { setOpen((v) => !v); }}
        disabled={status === "connecting"}
        className={cn(
          "rounded-full border px-4 py-1.5 text-[12px] transition-all duration-150",
          status === "connecting"
            ? "cursor-wait border-dim text-txt-tertiary"
            : "border-subtle text-txt-secondary hover:border-accent hover:text-white"
        )}
      >
        {status === "connecting" ? "Connecting…" : "Connect Wallet"}
      </button>

      {/* error shown outside the dropdown so it persists after the dropdown closes */}
      {error && !open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-subtle bg-elevated/95 px-4 py-3 text-[11px] leading-snug text-[#fca5a5] shadow-2xl backdrop-blur-xl">
          {error}
        </div>
      )}

      {open && status !== "connecting" && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-subtle bg-elevated/95 shadow-2xl backdrop-blur-xl">
          <p className="px-4 pb-1 pt-3 font-mono text-[10px] tracking-[0.16em] text-txt-tertiary">
            SELECT WALLET
          </p>
          {WALLETS.map(({ kind, label, installUrl }) =>
            available[kind] ? (
              <button
                key={kind}
                onClick={() => {
                  setOpen(false);
                  void connect(kind);
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] text-white transition-colors hover:bg-surface"
              >
                {label}
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-green)]" />
              </button>
            ) : (
              <a
                key={kind}
                href={installUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-between px-4 py-3 text-[13px] text-txt-tertiary transition-colors hover:bg-surface hover:text-txt-secondary"
              >
                {label}
                <span className="text-[11px]">Install ↗</span>
              </a>
            )
          )}
          {error && (
            <p className="border-t border-dim px-4 py-2.5 text-[11px] leading-snug text-[#fca5a5]">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
