/**
 * Injective public endpoints. Server-side chain reads use the LCD (REST)
 * and the explorer indexer — plain HTTPS with hard timeouts, no gRPC-web
 * transport needed inside serverless routes. The @injectivelabs SDK is
 * used client-side for wallet connection + transaction building.
 */

const NETWORK = process.env.NEXT_PUBLIC_INJECTIVE_NETWORK === "testnet"
  ? "testnet"
  : "mainnet";

const ENDPOINTS = {
  mainnet: {
    lcd: "https://sentry.lcd.injective.network",
    explorer: "https://sentry.explorer.grpc-web.injective.network/api/explorer/v1",
    chainId: "injective-1",
  },
  testnet: {
    lcd: "https://testnet.sentry.lcd.injective.network",
    explorer:
      "https://testnet.sentry.explorer.grpc-web.injective.network/api/explorer/v1",
    chainId: "injective-888",
  },
} as const;

export const injective = ENDPOINTS[NETWORK];
export const injectiveNetwork = NETWORK;
