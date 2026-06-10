import type { IntentType } from "@/types/chat";

export function parseIntent(message: string): IntentType {
  const m = message.toLowerCase().trim();

  if (/morning\s*brief|briefing|daily\s*update|what'?s\s*happening\s*today/.test(m)) return "briefing";
  if (/roast\s*(my\s*)?(wallet|portfolio|trades?|txs?)/.test(m)) return "roast";
  if (/scam|rug|fake\s*(token|nft|coin)|honeypot|(is\s*(this|it)|check).{0,30}(contract|token|nft|collection).{0,20}(safe|legit|real)?|(contract|token|address).{0,20}(safe|legit|sketchy|sus)\b/.test(m) && extractQueryAddress(message)) return "contract-check";
  if (/(should|can|do)\s*i\s*(buy|sell|ape|long|short|enter|exit)|good\s*(time|entry|moment)\s*to\s*(buy|sell)|worth\s*(buying|selling|aping)|buy\s*(inj|the\s*dip|now|rn)|sell\s*(inj|now|rn)|bullish|bearish/.test(m)) return "trade-advice";
  if (/my\s*balance|how\s*much\s*inj|check\s*balance/.test(m)) return "balance";
  if (/send\s+[\d.]+\s*inj/.test(m)) return "send";
  if (/gas|fee|safe\s*to\s*transact|network\s*congestion/.test(m)) return "gas";
  if (/recent\s*tx|transaction\s*hist|what\s*did\s*i\s*buy|last\s*trade/.test(m)) return "txhistory";
  if (/governance|proposal|voting|vote/.test(m)) return "governance";
  if (/price|inj\s*at|what'?s\s*inj|market/.test(m)) return "price";
  if (/protocol|dapp|ecosystem|what\s*should\s*i\s*use/.test(m)) return "ecosystem";
  if (/^(gm|gn|hello|hi|hey|sup|yo|what'?s\s*up)/.test(m)) return "greeting";

  return "chat";
}

/**
 * Pull an inj address out of a message (contract addresses are 62 chars,
 * accounts 42 — prefer the longer match).
 */
export function extractQueryAddress(message: string): string | null {
  const contract = message.match(/inj1[02-9ac-hj-np-z]{58}/);
  if (contract) return contract[0];
  const account = message.match(/inj1[02-9ac-hj-np-z]{38}/);
  return account ? account[0] : null;
}
