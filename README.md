# INJI — The Injective Analyst

**Talk to Injective instead of juggling five different apps.**

INJI is an AI copilot native to the Injective blockchain. It's not a chatbot with an API taped on — it's an agent: it reads live chain and market data, forms opinions with receipts, screens contracts for scams, and executes real transactions that **you** sign in **your** wallet. Keys never leave your wallet. There is no contract to trust.

**🚀 [Try it live → inji-ai.vercel.app](https://inji-ai.vercel.app)** · **🎬 [Watch the demo](https://www.loom.com/share/499ad102a4d241089f1032f4460ba217)** — live market analysis, wallet roast, and a real on-chain send, end to end.

![INJI Terminal](docs/screenshot.png)

---

## At a glance

**What it does & how users interact** — INJI is a chat terminal. You connect a wallet (Keplr / Leap / MetaMask) and talk to it in plain English on the `/chat` page. It answers market and on-chain questions with *live* data, screens contracts for scams, briefs you each morning, roasts your trading history, and proposes real INJ transfers that you confirm and sign in your own wallet.

**How AI is used** — A large language model drives a true **agentic loop**, not a scripted command parser. On every message the model autonomously decides which of **7 live tools** to call (market data, gas, governance, Helix markets, wallet history, contract safety, and transfer proposals) plus live web search, chains them across up to 6 reasoning turns, and synthesizes a single answer. The brain is provider-pluggable — NVIDIA NIM (Qwen 3.5 122B), Groq, Gemini, Anthropic, or MiniMax — selected with one env var, all running the identical tool set and safety guards. See [Why it's not a wrapper](#why-its-not-a-wrapper) and [Pluggable brains](#pluggable-brains).

**How Injective is integrated** — INJI is Injective-native end to end. It reads the chain through Injective's LCD + Explorer indexer (balances, transactions, gas, governance, contract bytecode/admin/mint flags) and Helix chronos (spot markets), and it *writes* to the chain by building a native `MsgSend` server-side with `@injectivelabs/sdk-ts`, which the user signs in-wallet and the server broadcasts. Works on both Injective **mainnet** and **testnet** (`injective-888`). No smart contract, no custody — see [Architecture](#architecture).

---

## What it does

| Ask INJI… | What happens under the hood |
|---|---|
| "Can I buy INJ rn?" | Pulls live price, 7-day momentum, RSI-14, volume trend, Crypto Fear & Greed, and Helix orderbook volume — then gives a **clear lean** (accumulate / wait / avoid), the level that would invalidate it, and a position-sizing sanity line. Always ends *NFA — DYOR.* |
| "Is this contract a scam? inj1…" | Heuristic on-chain screen: is it actually a contract, can an **admin swap the code** (rug vector), is the supply **infinitely mintable**, does the token **impersonate INJ/USDT/USDC** (fake-token pattern), CW721 collection verification guidance. |
| "Send 5 INJ to inj1…" | INJI validates the request against your live balance, then a **confirmation card** appears in chat — you approve in Keplr/Leap, it broadcasts, and you get the explorer link. INJI never touches your keys. |
| "Morning brief" | Wallet + INJ market + governance (live proposals with real tallies) + ecosystem news via live web search — one structured briefing. |
| "Roast my wallet" | Your actual transaction history, roasted. Specific, funny, fair — ends with one genuinely useful piece of advice. |
| "Is gas safe?" / "What's moving on Helix?" / "Any proposals I should care about?" | Live gas advisory, Helix spot markets ranked by real volume, governance with INJI's take. |

And yes — you can talk to it about anything. It's a full LLM with an Injective specialty, not a command parser.

## Why it's not a wrapper

The model runs a real **agentic loop**: it decides for itself which of **7 live tools** to call, chains them across up to 6 reasoning turns, and synthesizes — `get_market_intel`, `get_gas`, `get_governance`, `get_helix_markets`, `get_wallet_overview`, `check_contract`, `propose_send_inj`, plus live web search. A "should I buy" answer is built from five independent data sources, not retrieved from one.

## Pluggable brains

The agentic loop is **provider-agnostic** — set `INJI_BRAIN` and the same 7 tools, the same SSE streaming, and the same security guards run on any of six backends:

| `INJI_BRAIN` | Model | Needs | Notes |
|---|---|---|---|
| `nvidia` | Qwen 3.5 122B (MoE) | `NVIDIA_API_KEY` — free at [build.nvidia.com](https://build.nvidia.com) | **Recommended.** Free endpoint, strong tool calling, generous limits. Transient-error retry built in. |
| `groq` | Llama 3.3 70B / 3.1 8B | `GROQ_API_KEY` — free at console.groq.com | Fastest inference; free tier capped at 6k tokens/min. `compound-beta` models auto-detected (no tool support → single-turn). |
| `gemini` | Gemini Flash | `GEMINI_API_KEY` — free at aistudio.google.com/apikey | Free tier, deployable |
| `anthropic` | Claude Sonnet 4.6 | `ANTHROPIC_API_KEY` with credits | Best quality + native web search |
| `minimax` | MiniMax-M3 | `MINIMAX_API_KEY` (+ optional `MINIMAX_BASE_URL`) | Any OpenAI-compatible router |
| `claude-code` | Claude (local subscription) | A logged-in Claude Code install | Dev-machine only, not deployable |

Omit `INJI_BRAIN` to auto-pick from whichever key is present.

## Architecture

```
Browser ── Next.js 15 (App Router) ──────────────────────────────┐
│  Chat UI (SSE streaming, tx confirm cards, wallet pill)        │
│  Wallet: native injected APIs (Keplr / Leap / MetaMask)        │
│  — zero SDK in the client bundle                               │
├─ /api/chat ──── agentic brain loop (provider-pluggable)        │
│     INJI_BRAIN = nvidia | groq | gemini | anthropic |          │
│                  minimax | claude-code                          │
│     7 tools + web search, streamed over SSE                    │
├─ /api/chain/* ─ LCD + explorer indexer (REST, hard timeouts,   │
│     caching, rate limits): balance, txs, gas, governance,      │
│     contract safety screen                                     │
├─ /api/market/* ─ CoinGecko + Helix chronos: price, momentum,   │
│     RSI, fear/greed, top markets                               │
└─ /api/tx/* ──── server builds native MsgSend (sdk-ts),         │
      client signs via wallet signDirect, server broadcasts      │
      ── Injective mainnet or testnet ───────────────────────────┘
```

**Security model**
- **No private keys, ever** — transactions are signed inside the user's wallet extension
- **No smart contract** — reads are public REST, actions are native chain messages
- **Anti-hallucination send guard** — the server independently verifies that the recipient address in any transfer proposal appears verbatim in the user's own messages. The model *cannot* invent, autocomplete, or "remember" a recipient — if the user didn't type it, the tool refuses.
- **Balance + amount validation server-side** — amount format, per-transfer cap, and live balance (with fee headroom) are checked before a proposal card ever renders
- Server routes: rate-limited, input-validated, hard upstream timeouts, no error-body leakage
- The send pipeline was verified end-to-end (the chain's own signature/funds validation is the final gate)

## Quickstart

```bash
npm install
cp .env.example .env.local   # then add one API key (NVIDIA is free)
npm run dev                   # http://localhost:3000
```

Connect Keplr or Leap on the `/chat` terminal page and ask away.

### Testnet mode

Set `NEXT_PUBLIC_INJECTIVE_NETWORK=testnet` to run against `injective-888`:

- Keplr users get the testnet chain **auto-suggested** on first connect (no manual chain add)
- Explorer links point to the testnet explorer
- Fund a test wallet at the [Injective testnet faucet](https://testnet.faucet.injective.network)

## API surface

| Route | What |
|---|---|
| `POST /api/chat` | SSE agentic chat (text / status / tx_proposal / done events) |
| `GET /api/chain/balance?address=` | Live INJ balance + USD |
| `GET /api/chain/transactions?address=` | Recent txs, human-formatted |
| `GET /api/chain/gas` | Gas price + safe-to-transact advisory |
| `GET /api/chain/governance` | Proposals in voting (falls back to latest decided, real tallies) |
| `GET /api/chain/contract?address=` | Contract safety screen (admin/mint/impersonation flags) |
| `GET /api/market/price` | INJ/USD (CoinGecko, Binance fallback) |
| `GET /api/market/intel` | Price + momentum + RSI + volume trend + fear/greed + Helix |
| `GET /api/market/helix` | Top Helix spot markets by 24h volume |
| `POST /api/tx/prepare` | Builds an unsigned native MsgSend sign-doc |
| `POST /api/tx/broadcast` | Broadcasts the wallet-signed transaction |

## Deploy (Vercel)

```bash
npx vercel
```

Set these environment variables in the Vercel project:

| Var | Value |
|---|---|
| `INJI_BRAIN` | `nvidia` (free, recommended) — or `groq` / `gemini` / `anthropic` |
| `NVIDIA_API_KEY` | free key from build.nvidia.com |
| `NVIDIA_MODEL` | `qwen/qwen3.5-122b-a10b` (default) |
| `NEXT_PUBLIC_INJECTIVE_NETWORK` | `mainnet` or `testnet` |

Note: the `claude-code` brain is dev-machine-only and won't run on Vercel.

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind · React Three Fiber (the signal-field hero) · `@injectivelabs/sdk-ts` (server-side tx building) · NVIDIA NIM / Groq / Gemini / Anthropic / MiniMax / Claude Agent SDK (pluggable brains) · Injective LCD + Explorer + Helix chronos + CoinGecko + alternative.me

## Roadmap

- MetaMask transaction signing (EIP-712)
- Staking + governance voting from chat
- NFT mint + list flow (Talis)
- Structured brief/verdict cards
- Push-style daily briefing

---

*INJI never holds your keys. Transactions are signed in your wallet. Market commentary is intelligence, not financial advice — NFA, DYOR.*
