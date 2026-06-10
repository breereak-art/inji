import Link from "next/link";
import { Nav } from "@/components/landing/Nav";
import { Reveal } from "@/components/landing/Reveal";
import { SignalScene } from "@/components/canvas/SignalField";

const TICKER_ITEMS = [
  "SUB-SECOND FINALITY",
  "MEV-RESISTANT ORDERBOOK",
  "WEEKLY BURN AUCTION",
  "NATIVE EVM + COSMWASM",
  "IBC CONNECTED",
  "HELIX · NEPTUNE · HYDRO · TALIS",
  "100M MAX SUPPLY",
  "$0.0003 AVG FEE",
];

function Ticker() {
  const row = (
    <>
      {TICKER_ITEMS.map((item) => (
        <span key={item} className="flex items-center">
          <span className="px-8 font-mono text-[11px] tracking-[0.22em] text-txt-tertiary">
            {item}
          </span>
          <span className="h-1 w-1 rounded-full bg-inj-cyan/40" />
        </span>
      ))}
    </>
  );
  return (
    <div className="overflow-hidden border-y border-dim py-4">
      <div className="marquee-track">
        {row}
        {row}
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="relative bg-void text-txt-primary">
      <Nav />

      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6">
        <SignalScene className="pointer-events-none absolute inset-0" />
        {/* scrim keeps type legible over the field */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_50%_42%,rgba(3,4,7,0.7)_0%,transparent_100%)]" />

        <div className="relative z-10 flex max-w-[1000px] flex-col items-center text-center">
          <p className="rise rise-1 eyebrow flex items-center gap-2.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-inj-cyan" />
            Built on Injective · Powered by Claude
          </p>

          <h1 className="rise rise-2 mt-8 whitespace-nowrap font-display text-[clamp(42px,7.3vw,104px)] font-extrabold leading-[1.0] tracking-[-0.035em] text-white">
            Ask anything.
            <br />
            <span className="text-txt-tertiary">Know everything.</span>
          </h1>

          <p className="rise rise-3 mt-8 max-w-[440px] text-[16px] leading-relaxed text-txt-secondary">
            INJI is an AI analyst native to Injective. Live chain data, market
            intelligence, and non-custodial execution — one conversation.
          </p>

          <div className="rise rise-4 mt-12 flex items-center gap-7">
            <Link
              href="/chat"
              className="rounded-full bg-white px-7 py-3 text-[14px] font-semibold text-black transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
            >
              Open the Terminal
            </Link>
            <a
              href="#terminal"
              className="text-[14px] text-txt-secondary transition-colors duration-200 hover:text-inj-cyan-soft"
            >
              See it think →
            </a>
          </div>
        </div>

        <div className="rise rise-5 absolute bottom-10 z-10 flex flex-col items-center gap-3">
          <span className="scroll-cue" />
        </div>
      </section>

      {/* ───────────────────── Ticker ───────────────────── */}
      <Ticker />

      {/* ───────────────────── Terminal ───────────────────── */}
      <section id="terminal" className="relative px-6 py-44">
        <div className="mx-auto max-w-wrap">
          <Reveal className="mx-auto max-w-[640px] text-center">
            <p className="eyebrow">The Terminal</p>
            <h2 className="mt-6 font-display text-[clamp(34px,4.5vw,54px)] font-extrabold leading-[1.05] tracking-[-0.025em] text-white">
              Intelligence you
              <br />
              can talk to.
            </h2>
          </Reveal>

          <Reveal className="relative mx-auto mt-20 max-w-[860px]" delay={120}>
            {/* soft glow seat under the panel */}
            <div className="pointer-events-none absolute -inset-x-20 -bottom-24 top-1/2 bg-[radial-gradient(ellipse_50%_60%_at_50%_100%,rgba(0,212,255,0.07)_0%,transparent_70%)]" />

            <div className="panel relative overflow-hidden !rounded-2xl">
              <div className="flex items-center justify-between border-b border-dim px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--status-green)]" />
                  <span className="font-mono text-[11px] tracking-[0.1em] text-txt-secondary">
                    INJI — TERMINAL
                  </span>
                </div>
                <span className="font-mono text-[11px] text-txt-tertiary">
                  injective-1 · mainnet
                </span>
              </div>

              <div className="space-y-7 px-6 py-9 text-left md:px-10">
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-br-md border border-subtle bg-elevated px-4 py-2.5 text-[14px] text-white">
                    roast my wallet
                  </div>
                </div>

                <div className="max-w-[560px]">
                  <p className="mb-2 font-mono text-[10px] tracking-[0.16em] text-txt-tertiary">
                    INJI
                  </p>
                  <p className="text-[14px] leading-relaxed text-txt-secondary">
                    Right. Let&apos;s have a look at what we&apos;re working
                    with here&hellip; You bought{" "}
                    <span className="font-mono text-inj-cyan-soft">
                      12.4 INJ
                    </span>{" "}
                    at the local top, sold the exact bottom nine days later,
                    then paid{" "}
                    <span className="font-mono text-inj-cyan-soft">
                      $0.0003
                    </span>{" "}
                    in gas to do it all again. The chain remembers everything.
                    Fortunately, so do I — and your staking yield is the one
                    adult decision in this entire history.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────── Intelligence ───────────────────── */}
      <section id="intelligence" className="px-6 py-44">
        <div className="mx-auto max-w-wrap">
          <Reveal>
            <p className="eyebrow">Intelligence</p>
            <h2 className="mt-6 max-w-[640px] font-display text-[clamp(34px,4.5vw,54px)] font-extrabold leading-[1.05] tracking-[-0.025em] text-white">
              Native to the chain.
              <br />
              <span className="text-txt-tertiary">Fluent in markets.</span>
            </h2>
          </Reveal>

          <div className="mt-24 grid gap-6 md:grid-cols-3">
            {[
              {
                index: "01",
                title: "Morning Brief",
                body: "Your wallet, INJ price action, ecosystem news, and governance deadlines — distilled into one structured briefing every time you ask.",
              },
              {
                index: "02",
                title: "Wallet Roast",
                body: "A brutally honest read of your on-chain history. Specific, funny, and fair — ending with the one piece of advice you actually need.",
              },
              {
                index: "03",
                title: "Live Reasoning",
                body: "INJI searches live sources, forms a position, and shows its work. Opinions with receipts — not hedged non-answers.",
              },
            ].map((f, i) => (
              <Reveal key={f.index} delay={i * 100}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-dim p-9 transition-all duration-300 hover:border-subtle hover:bg-surface/50">
                  <p className="pointer-events-none absolute -right-3 -top-7 font-display text-[110px] font-extrabold leading-none text-white/[0.03] transition-colors duration-300 group-hover:text-white/[0.05]">
                    {f.index}
                  </p>
                  <p className="font-mono text-[11px] tracking-[0.16em] text-inj-cyan">
                    {f.index}
                  </p>
                  <h3 className="mt-10 font-display text-[21px] font-bold tracking-tight text-white">
                    {f.title}
                  </h3>
                  <p className="mt-3.5 text-[14px] leading-relaxed text-txt-secondary">
                    {f.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────── Stats ───────────────────── */}
      <section className="px-6">
        <Reveal className="mx-auto max-w-wrap">
          <div className="grid grid-cols-2 gap-y-14 border-y border-dim py-20 md:grid-cols-4">
            {[
              ["<1s", "Block finality"],
              ["100M", "Max INJ supply"],
              ["$0.0003", "Avg. transaction fee"],
              ["24/7", "Market intelligence"],
            ].map(([value, label]) => (
              <div key={label} className="text-center">
                <p className="font-display text-[clamp(34px,4vw,46px)] font-extrabold tracking-tight text-white">
                  {value}
                </p>
                <p className="mt-2 text-[12px] tracking-wide text-txt-tertiary">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ───────────────────── How it works ───────────────────── */}
      <section id="how" className="px-6 py-44">
        <div className="mx-auto max-w-wrap">
          <Reveal>
            <p className="eyebrow">How it works</p>
          </Reveal>

          <div className="mt-20">
            {[
              {
                step: "01",
                title: "Connect",
                body: "Keplr or MetaMask. Read-only until you decide otherwise.",
              },
              {
                step: "02",
                title: "Ask",
                body: "Balances, gas, governance, markets — in plain English.",
              },
              {
                step: "03",
                title: "Act",
                body: "INJI builds the transaction. You sign it in your wallet.",
              },
            ].map((s, i) => (
              <Reveal key={s.step} delay={i * 80}>
                <div className="group relative grid grid-cols-1 items-center gap-4 border-b border-dim py-14 md:grid-cols-[1fr_1fr]">
                  <p className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 select-none font-display text-[clamp(100px,14vw,170px)] font-extrabold leading-none text-white/[0.03]">
                    {s.step}
                  </p>
                  <h3 className="relative z-10 pl-2 font-display text-[clamp(30px,4vw,46px)] font-extrabold tracking-[-0.02em] text-white md:pl-24">
                    {s.title}
                  </h3>
                  <p className="relative z-10 max-w-[360px] pl-2 text-[15px] leading-relaxed text-txt-secondary md:justify-self-end md:pl-0">
                    {s.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────── Security ───────────────────── */}
      <section id="security" className="px-6 py-48">
        <Reveal className="mx-auto max-w-[680px] text-center">
          <p className="eyebrow">Security</p>
          <h2 className="mt-7 font-display text-[clamp(36px,5.5vw,62px)] font-extrabold leading-[1.04] tracking-[-0.025em] text-white">
            Your keys never
            <br />
            leave your wallet.
          </h2>
          <p className="mx-auto mt-8 max-w-[480px] text-[15px] leading-relaxed text-txt-secondary">
            INJI constructs transaction parameters — nothing more. Every
            transaction is signed in Keplr or MetaMask, by you. No custody. No
            seed phrases. Ever.
          </p>
          <p className="mt-10 font-mono text-[11px] tracking-[0.2em] text-txt-tertiary">
            SIGNED IN YOUR WALLET · NOT OURS
          </p>
        </Reveal>
      </section>

      {/* ───────────────────── Final CTA ───────────────────── */}
      <section className="px-6 pb-44">
        <Reveal className="mx-auto max-w-wrap">
          <div className="flex flex-col items-center border-t border-dim pt-28 text-center">
            <h2 className="font-display text-[clamp(32px,4.5vw,52px)] font-extrabold tracking-[-0.02em] text-white">
              Start the conversation.
            </h2>
            <Link
              href="/chat"
              className="mt-10 rounded-full bg-white px-8 py-3.5 text-[14px] font-semibold text-black transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
            >
              Open the Terminal
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ───────────────────── Footer ───────────────────── */}
      <footer className="border-t border-dim px-6 py-12">
        <div className="mx-auto flex max-w-wrap flex-col items-center justify-between gap-4 md:flex-row">
          <span className="font-display text-[14px] font-extrabold tracking-tight text-white">
            INJI
          </span>
          <p className="font-mono text-[11px] tracking-[0.1em] text-txt-tertiary">
            BUILT ON INJECTIVE · POWERED BY CLAUDE · KEYS NEVER LEAVE YOUR
            WALLET
          </p>
        </div>
      </footer>
    </main>
  );
}
