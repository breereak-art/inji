import { cached } from "@/lib/server/cache";
import { fetchJson } from "@/lib/server/http";
import { injective } from "@/lib/injective/endpoints";
import type { ContractReport } from "@/types/chat";

interface ContractInfoResponse {
  contract_info?: {
    code_id?: string;
    creator?: string;
    admin?: string;
    label?: string;
  };
}

interface Cw20TokenInfo {
  name?: string;
  symbol?: string;
  decimals?: number;
  total_supply?: string;
}

interface Cw20Minter {
  minter?: string;
  cap?: string | null;
}

interface Cw721ContractInfo {
  name?: string;
  symbol?: string;
}

/** Names/symbols scammers imitate; a random CW20 using these is a red flag. */
const IMPERSONATION_TARGETS = [
  "inj",
  "injective",
  "usdt",
  "tether",
  "usdc",
  "weth",
  "wbtc",
  "atom",
  "sol",
];

async function smartQuery<T>(address: string, query: object): Promise<T | null> {
  const encoded = Buffer.from(JSON.stringify(query)).toString("base64");
  try {
    const res = await fetchJson<{ data?: T }>(
      `${injective.lcd}/cosmwasm/wasm/v1/contract/${address}/smart/${encodeURIComponent(encoded)}`,
      {},
      6000
    );
    return res.data ?? null;
  } catch {
    return null; // contract doesn't implement this interface
  }
}

/**
 * Heuristic safety read of an address. Never a verdict — a set of flags INJI
 * explains to the user. Cached 10 min per address.
 */
export function getContractReport(address: string): Promise<ContractReport> {
  return cached(`chain:contract:${address}`, 10 * 60_000, async () => {
    let info: ContractInfoResponse["contract_info"];
    try {
      const res = await fetchJson<ContractInfoResponse>(
        `${injective.lcd}/cosmwasm/wasm/v1/contract/${address}`,
        {},
        8000
      );
      info = res.contract_info;
    } catch {
      // not a contract (regular wallet) or LCD rejected the address
      return {
        address,
        isContract: false,
        flags: [
          {
            level: "info" as const,
            text: "This address is not a smart contract — it's a regular wallet account (or does not exist on chain).",
          },
        ],
      };
    }

    const [tokenInfo, minter, nftInfo] = await Promise.all([
      smartQuery<Cw20TokenInfo>(address, { token_info: {} }),
      smartQuery<Cw20Minter>(address, { minter: {} }),
      smartQuery<Cw721ContractInfo>(address, { contract_info: {} }),
    ]);

    const flags: ContractReport["flags"] = [];
    const admin = info?.admin || null;

    if (admin) {
      flags.push({
        level: "warning",
        text: `Contract is UPGRADABLE — admin ${admin.slice(0, 12)}… can replace the contract code at any time (migration). Funds interacting with it depend on trusting that admin.`,
      });
      if (admin === info?.creator) {
        flags.push({
          level: "warning",
          text: "Admin is the original creator wallet (not a DAO or multisig) — single-key control.",
        });
      }
    } else {
      flags.push({
        level: "info",
        text: "Contract is immutable — no admin can change its code.",
      });
    }

    if (tokenInfo?.name) {
      const name = (tokenInfo.name ?? "").toLowerCase();
      const symbol = (tokenInfo.symbol ?? "").toLowerCase();
      const impersonating = IMPERSONATION_TARGETS.find(
        (t) => name === t || symbol === t || name.includes(`wrapped ${t}`)
      );
      if (impersonating) {
        flags.push({
          level: "danger",
          text: `Token name/symbol imitates "${impersonating.toUpperCase()}" — major assets on Injective are NOT random CW20 contracts (INJ is native; USDT/USDC are bridged denoms). This is a classic fake-token pattern.`,
        });
      }
      if (minter?.minter && !minter.cap) {
        flags.push({
          level: "warning",
          text: `Supply is INFLATABLE — minter ${minter.minter.slice(0, 12)}… can mint unlimited new tokens (no cap).`,
        });
      }
    }

    if (!tokenInfo?.name && nftInfo?.name) {
      flags.push({
        level: "info",
        text: `CW721 NFT collection "${nftInfo.name}". Verify it's the official collection via the marketplace (Talis) link from the project's own website/X — fake collections reuse names and images.`,
      });
    }

    return {
      address,
      isContract: true,
      label: info?.label,
      codeId: info?.code_id,
      creator: info?.creator,
      admin,
      tokenInfo: tokenInfo?.name
        ? {
            name: tokenInfo.name,
            symbol: tokenInfo.symbol ?? "?",
            decimals: tokenInfo.decimals ?? 0,
            totalSupply: tokenInfo.total_supply ?? "?",
          }
        : undefined,
      nftInfo: nftInfo?.name
        ? { name: nftInfo.name, symbol: nftInfo.symbol ?? "?" }
        : undefined,
      flags,
    };
  });
}
