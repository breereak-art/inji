"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ethToInjAddress } from "@/lib/wallet/address";
import { injective } from "@/lib/injective/endpoints";

export type WalletKind = "keplr" | "leap" | "metamask";
export type WalletStatus = "disconnected" | "connecting" | "connected";

const INJECTIVE_CHAIN_ID = injective.chainId;

/**
 * Connects via the extensions' native injected APIs — no Injective SDK in the
 * client bundle (it adds thousands of modules). Transaction signing will use
 * the same native APIs against server-built sign docs.
 */
interface CosmosWalletApi {
  enable(chainId: string): Promise<void>;
  getOfflineSigner(chainId: string): {
    getAccounts(): Promise<{ address: string }[]>;
  };
}

interface EthereumApi {
  isMetaMask?: boolean;
  request(args: { method: string }): Promise<string[]>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

function getInjectedWallets() {
  if (typeof window === "undefined") return {};
  const w = window as unknown as {
    keplr?: CosmosWalletApi;
    leap?: CosmosWalletApi;
    ethereum?: EthereumApi;
  };
  return w;
}

/** Which extensions are injected into this browser. */
export function detectWallets(): Record<WalletKind, boolean> {
  const w = getInjectedWallets();
  return {
    keplr: !!w.keplr,
    leap: !!w.leap,
    metamask: !!w.ethereum?.isMetaMask,
  };
}

interface WalletContextValue {
  status: WalletStatus;
  wallet: WalletKind | null;
  address: string | null;
  /** Formatted INJ balance, e.g. "12.4301" — null while loading. */
  balance: string | null;
  error: string | null;
  connect: (kind: WalletKind) => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const STORAGE_KEY = "inji.wallet";

async function requestAddress(kind: WalletKind): Promise<string> {
  const w = getInjectedWallets();

  if (kind === "metamask") {
    if (!w.ethereum) throw new Error("MetaMask is not installed.");
    const accounts = await w.ethereum.request({
      method: "eth_requestAccounts",
    });
    if (!accounts?.length) throw new Error("MetaMask returned no accounts.");
    return ethToInjAddress(accounts[0]);
  }

  const api = kind === "keplr" ? w.keplr : w.leap;
  if (!api) {
    throw new Error(
      `${kind === "keplr" ? "Keplr" : "Leap"} is not installed.`
    );
  }
  await api.enable(INJECTIVE_CHAIN_ID);
  const accounts = await api
    .getOfflineSigner(INJECTIVE_CHAIN_ID)
    .getAccounts();
  if (!accounts.length) throw new Error("The wallet returned no accounts.");
  return accounts[0].address;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [wallet, setWallet] = useState<WalletKind | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addressRef = useRef<string | null>(null);
  const walletRef = useRef<WalletKind | null>(null);

  const fetchBalance = useCallback(async (addr: string) => {
    try {
      const res = await fetch(
        `/api/chain/balance?address=${encodeURIComponent(addr)}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { balance?: string };
      // a later connect/disconnect may have changed the address — don't clobber
      if (addressRef.current === addr && typeof data.balance === "string") {
        setBalance(data.balance);
      }
    } catch {
      // balance is decoration; never break the connection over it
    }
  }, []);

  const connect = useCallback(
    async (kind: WalletKind) => {
      setStatus("connecting");
      setError(null);
      try {
        const injAddress = await requestAddress(kind);
        addressRef.current = injAddress;
        walletRef.current = kind;
        setAddress(injAddress);
        setWallet(kind);
        setStatus("connected");
        setBalance(null);
        try {
          localStorage.setItem(STORAGE_KEY, kind);
        } catch {
          // private mode — connection still works, it just won't persist
        }
        void fetchBalance(injAddress);
      } catch (err) {
        addressRef.current = null;
        walletRef.current = null;
        setStatus("disconnected");
        setAddress(null);
        setWallet(null);
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "Could not connect the wallet.";
        // wallet extensions throw verbose errors; keep the first line
        setError(msg.split("\n")[0].slice(0, 160));
      }
    },
    [fetchBalance]
  );

  const disconnect = useCallback(() => {
    addressRef.current = null;
    walletRef.current = null;
    setStatus("disconnected");
    setWallet(null);
    setAddress(null);
    setBalance(null);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    if (addressRef.current) await fetchBalance(addressRef.current);
  }, [fetchBalance]);

  // Auto-reconnect a previously approved wallet (silent if already authorized).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (saved !== "keplr" && saved !== "leap" && saved !== "metamask") return;
    // extensions inject asynchronously — give them a beat before checking
    const timer = setTimeout(() => {
      if (detectWallets()[saved as WalletKind]) {
        void connect(saved as WalletKind);
      }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow account switches in the wallet extension.
  useEffect(() => {
    const onKeystoreChange = () => {
      const kind = walletRef.current;
      if (kind === "keplr" || kind === "leap") void connect(kind);
    };
    const onAccountsChanged = () => {
      if (walletRef.current === "metamask") void connect("metamask");
    };
    window.addEventListener("keplr_keystorechange", onKeystoreChange);
    window.addEventListener("leap_keystorechange", onKeystoreChange);
    const eth = getInjectedWallets().ethereum;
    eth?.on?.("accountsChanged", onAccountsChanged);
    return () => {
      window.removeEventListener("keplr_keystorechange", onKeystoreChange);
      window.removeEventListener("leap_keystorechange", onKeystoreChange);
      eth?.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [connect]);

  return (
    <WalletContext.Provider
      value={{
        status,
        wallet,
        address,
        balance,
        error,
        connect,
        disconnect,
        refreshBalance,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
