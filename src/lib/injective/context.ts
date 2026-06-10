import { formatDistanceToNowStrict } from "date-fns";
import { getBalance, getGas, getGovernance, getTransactions } from "@/lib/injective/queries";
import { getInjPrice } from "@/lib/market/coingecko";
import { withTimeout } from "@/lib/server/http";
import type { ChainContext } from "@/types/chat";

/**
 * Assembles the live chain context injected into INJI's system prompt.
 * Every sub-query is independently timeboxed; any subset may fail without
 * taking the chat down — INJI degrades to whatever data arrived.
 */
export async function buildChainContext(
  address: string
): Promise<ChainContext | null> {
  const BUDGET = 9000;

  const [balance, gas, price, txs, gov] = await Promise.allSettled([
    withTimeout(getBalance(address), BUDGET),
    withTimeout(getGas(), BUDGET),
    withTimeout(getInjPrice(), BUDGET),
    withTimeout(getTransactions(address, 10), BUDGET),
    withTimeout(getGovernance(), BUDGET),
  ]);

  // Without at least a balance read, the context adds nothing — skip it.
  if (balance.status === "rejected") return null;

  const priceData = price.status === "fulfilled" ? price.value : null;
  const gasData = gas.status === "fulfilled" ? gas.value : null;

  return {
    address,
    balance: `${balance.value.balance} INJ`,
    balanceUSD: balance.value.balanceUSD === "—" ? "USD value unavailable" : `$${balance.value.balanceUSD}`,
    price: priceData ? `$${priceData.price.toFixed(2)}` : "unavailable",
    priceChange24h: priceData ? `${priceData.change24h.toFixed(2)}%` : "unavailable",
    gasPrice: gasData ? `${gasData.gasPriceGwei} gwei-equivalent (${gasData.status})` : "unavailable",
    gasSafe: gasData?.safe ?? true,
    recentTxs:
      txs.status === "fulfilled"
        ? txs.value.map((tx) => ({
            type: tx.type,
            amount: tx.amount,
            time: tx.time
              ? `${formatDistanceToNowStrict(new Date(tx.time))} ago`
              : "",
          }))
        : [],
    governance:
      gov.status === "fulfilled"
        ? gov.value.map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            endTime: p.endTime,
          }))
        : undefined,
  };
}
