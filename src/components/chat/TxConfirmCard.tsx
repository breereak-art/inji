"use client";

import { useState } from "react";
import type { BroadcastTxResponse, TxFlowPhase, TxProposal } from "@/types/chat";
import { useWallet } from "@/components/wallet/WalletProvider";
import { sendInj } from "@/lib/wallet/sendInj";
import { truncateAddress } from "@/lib/wallet/address";
import { injective } from "@/lib/injective/endpoints";
import { cn } from "@/lib/utils/cn";

const PHASE_LABEL: Partial<Record<TxFlowPhase, string>> = {
  preparing: "Building transaction…",
  signing: "Approve in your wallet…",
  broadcasting: "Broadcasting…",
};

function Row({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[12px] text-txt-tertiary">{label}</span>
      <span className="font-mono text-[12px] text-txt-secondary" title={title}>
        {value}
      </span>
    </div>
  );
}

export function TxConfirmCard({
  proposal,
  onDone,
}: {
  proposal: TxProposal;
  onDone?: (summaryMarkdown: string) => void;
}) {
  const { address, wallet, refreshBalance } = useWallet();
  const [phase, setPhase] = useState<TxFlowPhase>("idle");
  const [result, setResult] = useState<BroadcastTxResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const busy =
    phase === "preparing" || phase === "signing" || phase === "broadcasting";

  const confirm = async () => {
    if (busy || phase === "success") return;
    if (!address || !wallet) {
      setError("Connect a wallet to sign this transaction.");
      setPhase("error");
      return;
    }
    setError(null);
    try {
      const res = await sendInj(proposal, address, wallet, (p) => setPhase(p));
      setResult(res);
      setPhase("success");
      void refreshBalance();
      onDone?.(
        `Transaction broadcast ✅ — [view on explorer](${res.explorerUrl})`
      );
    } catch (err) {
      // wallet extensions throw verbose errors; keep the first line
      const msg =
        err instanceof Error && err.message
          ? err.message.split("\n")[0].slice(0, 200)
          : "Transaction failed.";
      setError(msg);
      setPhase("error");
    }
  };

  if (dismissed) {
    return (
      <p className="mt-3 text-[13px] italic text-txt-tertiary">
        Transaction dismissed.
      </p>
    );
  }

  return (
    <div className="mt-4 w-full max-w-[420px] rounded-2xl border border-subtle bg-surface/80 p-5 backdrop-blur-xl">
      {/* header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-[0.16em] text-txt-tertiary">
          SEND INJ
        </p>
        <span className="rounded-full border border-subtle bg-elevated px-2.5 py-0.5 font-mono text-[10px] text-txt-tertiary">
          {injective.chainId}
        </span>
      </div>

      {/* amount */}
      <p className="mt-4 font-mono text-[28px] leading-none text-white">
        {proposal.amountInj}{" "}
        <span className="text-[15px] text-txt-secondary">INJ</span>
      </p>

      {/* details */}
      <div className="mt-4 space-y-2 border-t border-dim pt-4">
        <Row
          label="To"
          value={truncateAddress(proposal.recipient)}
          title={proposal.recipient}
        />
        <Row label="Network fee" value={`~${proposal.feeInj} INJ`} />
        {proposal.memo ? <Row label="Memo" value={proposal.memo} /> : null}
      </div>

      {/* footer */}
      <div className="mt-5">
        {phase === "success" && result ? (
          <div className="flex items-center gap-2.5">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "var(--status-green)" }}
            />
            <span className="text-[13px] text-white">Broadcast</span>
            <a
              href={result.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={result.txHash}
              className="font-mono text-[12px] text-inj-cyan-soft hover:underline"
            >
              {result.txHash.length > 18
                ? `${result.txHash.slice(0, 10)}…${result.txHash.slice(-6)}`
                : result.txHash}
            </a>
          </div>
        ) : busy ? (
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
            <span className="text-[13px] text-txt-secondary">
              {PHASE_LABEL[phase]}
            </span>
          </div>
        ) : phase === "error" ? (
          <div className="space-y-3">
            <p className="text-[13px] text-[#fca5a5]">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setPhase("idle");
              }}
              className="rounded-full border border-subtle px-4 py-2 text-[13px] text-txt-secondary transition-all duration-150 hover:border-strong hover:text-white active:scale-[0.97]"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={() => setDismissed(true)}
              className="rounded-full border border-subtle px-4 py-2 text-[13px] text-txt-secondary transition-all duration-150 hover:border-strong hover:text-white active:scale-[0.97]"
            >
              Reject
            </button>
            <button
              onClick={confirm}
              className={cn(
                "rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black",
                "transition-all duration-150 hover:scale-[1.03] active:scale-95"
              )}
            >
              Confirm &amp; Sign
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
