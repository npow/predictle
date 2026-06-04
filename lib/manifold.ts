// Fetches and filters prediction markets from Manifold's public API to match
// the original Predictle's eligibility criteria as closely as the public API
// allows (the original queries the DB directly).

import { HIDE_FROM_NEW_USER_SLUGS } from "./constants";
import { vetMarkets } from "./clarity";

export interface LiteMarket {
  id: string;
  question: string;
  url: string;
  probability: number;
  outcomeType: string;
  mechanism: string;
  isResolved: boolean;
  uniqueBettorCount: number;
  createdTime: number;
  closeTime?: number;
  token?: string;
  groupSlugs?: string[];
}

export interface PuzzleMarket {
  id: string;
  question: string;
  url: string;
  probability: number;
}

// Several sort orders unioned together give a much larger candidate universe
// (~1400 eligible vs ~250 from one sort) for unlimited play. `score` is
// Manifold's importance score — the original's `ORDER BY importance_score DESC` —
// and is fetched first so we still vet the most important markets first.
const SEARCH_SORTS = [
  "score",
  "most-popular",
  "liquidity",
  "24-hour-vol",
  "newest",
  "last-updated",
];
const searchUrl = (sort: string) =>
  `https://api.manifold.markets/v0/search-markets?term=&filter=open&contractType=BINARY&sort=${sort}&limit=1000`;

const DAY = 24 * 60 * 60 * 1000;

// How many vetted markets to keep in the working pool. Larger = more variety
// for unlimited play (the original only needs ~20 for a single daily puzzle).
const POOL_TARGET = 250;

let poolCache: { at: number; markets: PuzzleMarket[] } | null = null;
const POOL_TTL_MS = 1000 * 60 * 10; // 10 minutes

// Matches the original's SQL WHERE clause (minus group_slugs, which the public
// lite API doesn't expose — we filter those out below when present).
function isEligible(m: LiteMarket, now: number): boolean {
  return (
    m.outcomeType === "BINARY" &&
    m.mechanism === "cpmm-1" &&
    !m.isResolved &&
    (m.token === undefined || m.token === "MANA") &&
    typeof m.probability === "number" &&
    m.probability > 0.05 &&
    m.probability < 0.95 &&
    m.uniqueBettorCount > 20 &&
    m.createdTime < now - DAY &&
    (m.closeTime == null || m.closeTime > now + 7 * DAY) &&
    !!m.question &&
    !(m.groupSlugs ?? []).some((s) => HIDE_FROM_NEW_USER_SLUGS.includes(s))
  );
}

// Returns the working pool: importance-ordered, eligible, and quality-vetted,
// capped at POOL_TARGET. Cached for 10 minutes.
export async function getMarketPool(): Promise<PuzzleMarket[]> {
  if (poolCache && Date.now() - poolCache.at < POOL_TTL_MS) {
    return poolCache.markets;
  }

  // Fetch several sort orders in parallel and union by id (first-seen wins, so
  // importance order is preserved for the top markets).
  const lists = await Promise.all(
    SEARCH_SORTS.map(async (sort) => {
      try {
        const res = await fetch(searchUrl(sort), {
          headers: { Accept: "application/json" },
          next: { revalidate: 600 },
        });
        return res.ok ? ((await res.json()) as LiteMarket[]) : [];
      } catch {
        return [];
      }
    })
  );

  const byId = new Map<string, LiteMarket>();
  for (const list of lists) {
    for (const m of list) if (!byId.has(m.id)) byId.set(m.id, m);
  }
  if (byId.size === 0) {
    throw new Error("Manifold API unavailable.");
  }
  const now = Date.now();
  const eligible = [...byId.values()].filter((m) => isEligible(m, now));

  // Quality-vet in importance order until we have POOL_TARGET clear questions
  // (mirrors the original's filterMarketsForQuality; no-op if LLM disabled).
  const vetted = await vetMarkets(eligible, POOL_TARGET);

  const markets: PuzzleMarket[] = vetted.map((m) => ({
    id: m.id,
    question: m.question.trim(),
    url: m.url,
    probability: m.probability,
  }));

  poolCache = { at: now, markets };
  return markets;
}
