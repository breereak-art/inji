# INJI — The Injective Analyst

**Talk to Injective instead of juggling five different apps.**

INJI is an AI copilot native to the Injective blockchain. It's not a chatbot with an API taped on — it's an agent: it reads live chain and market data, forms opinions with receipts, screens contracts for scams, and executes real transactions that **you** sign in **your** wallet. Keys never leave your wallet. There is no contract to trust.

![INJI Terminal](docs/screenshot.png)

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

## Architecture

```
Browser ── Next.js 15 (App Router) ──────────────────────────────┐
│  Chat UI (SSE streaming, tx confirm cards, wallet pill)        │
│  Wallet: native injected APIs (Keplr / Leap / MetaMask)        │
│  — zero SDK in the client bundle                               │
├─ /api/chat ──── agentic brain loop (provider-pluggable)        │
│     INJI_BRAIN = anthropic | gemini | claude-code              │
│     7 tools + web search, streamed over SSE                    │
├─ /api/chain/* ─ LCD + explorer indexer (REST, hard timeouts,   │
│     caching, rate limits): balance, txs, gas, governance,      │
│     contract safety screen                                     │
├─ /api/market/* ─ CoinGecko + Helix chronos: price, momentum,   │
│     RSI, fear/greed, top markets                               │
└─ /api/tx/* ──── server builds native MsgSend (sdk-ts),         │
      client signs via wallet signDirect, server broadcasts      │
      ── Injective mainnet ──────────────────────────────────────┘
```

**Security model**
- No private keys, ever — transactions are signed inside the user's wallet extension
- No smart contract — reads are public REST, actions are native chain messages
- Server routes: rate-limited, input-validated, hard upstream timeouts, no error-body leakage
- The send pipeline was verified against mainnet end-to-end (the chain's own signature/funds validation is the final gate)

## Quickstart

```bash
npm install
cp .env.example .env.local   # then edit:
```

Pick a brain in `.env.local`:

| `INJI_BRAIN` | Needs | Notes |
|---|---|---|
| `gemini` | `GEMINI_API_KEY` (free — aistudio.google.com/apikey) | Free tier, deployable |
| `anthropic` | `ANTHROPIC_API_KEY` with credits | Best quality (Claude Sonnet 4.6 + web search) |
| `claude-code` | A logged-in local Claude Code install | Dev-machine only, runs on your subscription |

```bash
npm run dev   # http://localhost:3000
```

Connect Keplr or Leap on the `/chat` terminal page and ask away.

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

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind · React Three Fiber (the signal-field hero) · `@injectivelabs/sdk-ts` (server-side tx building) · Anthropic / Gemini / Claude Agent SDK (pluggable brains) · Injective LCD + Explorer + Helix chronos + CoinGecko + alternative.me

## Roadmap

- MetaMask transaction signing (EIP-712)
- Staking + governance voting from chat
- NFT mint + list flow (Talis)
- Structured brief/verdict cards
- Push-style daily briefing

---

*INJI never holds your keys. Transactions are signed in your wallet. Market commentary is intelligence, not financial advice — NFA, DYOR.*
