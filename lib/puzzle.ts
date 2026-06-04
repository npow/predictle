import crypto from "crypto";
import { getMarketPool, PuzzleMarket } from "./manifold";

export const PUZZLE_SIZE = 5;
export const MAX_GUESSES = 4;

// Markets must be at least this far apart in probability so the ordering is
// unambiguous (matches the original Predictle's 5%).
const MIN_GAP = 0.05;

const SECRET = process.env.PUZZLE_SECRET || "dev-predictle-secret-change-me";

// ---- deterministic RNG (mulberry32) ----
function makeRng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pick PUZZLE_SIZE markets that are all at least MIN_GAP apart in probability,
// matching the original's "shuffle, then greedily take far-enough markets".
function pickSpreadSet(pool: PuzzleMarket[], rng: () => number): PuzzleMarket[] | null {
  for (let attempt = 0; attempt < 80; attempt++) {
    const shuffled = shuffle(pool, rng);
    const selected: PuzzleMarket[] = [];
    for (const m of shuffled) {
      if (selected.length >= PUZZLE_SIZE) break;
      if (selected.every((s) => Math.abs(m.probability - s.probability) >= MIN_GAP)) {
        selected.push(m);
      }
    }
    if (selected.length >= PUZZLE_SIZE) return selected;
  }
  return null;
}

export interface PuzzleItem {
  id: string;
  question: string;
  url: string;
}

// Signed payload — never sent to the client in the clear.
export interface PuzzlePayload {
  puzzleId: string;
  // correct order, highest -> lowest probability, as market ids
  order: string[];
  probs: Record<string, number>;
  items: PuzzleItem[];
}

export interface PublicPuzzle {
  puzzleId: string;
  size: number;
  maxGuesses: number;
  // items in shuffled (display) order — NO probabilities leak here
  items: PuzzleItem[];
  token: string;
  code?: string; // present when this is a shared puzzle
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}

function encodeToken(payload: PuzzlePayload): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${b64}.${sign(b64)}`;
}

export function decodeToken(token: string): PuzzlePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (sign(b64) !== sig) return null;
  try {
    return JSON.parse(Buffer.from(b64, "base64url").toString()) as PuzzlePayload;
  } catch {
    return null;
  }
}

export async function generatePuzzle(exclude: string[] = []): Promise<PublicPuzzle> {
  const pool = await getMarketPool();
  if (pool.length < PUZZLE_SIZE) {
    throw new Error("Not enough markets available right now.");
  }

  const puzzleId = hashStr(crypto.randomUUID()).toString(36);
  const seed = hashStr(puzzleId);
  const rng = makeRng(seed);

  // Dedupe: exclude as many recently-seen markets as possible while still being
  // able to build a spread-out puzzle. `exclude` is ordered most-recent first,
  // so we keep the freshest exclusions and only drop the oldest if forced to.
  // This maximizes repeat spacing for any pool size (no all-or-nothing reset).
  let chosenSet: PuzzleMarket[] | null = null;
  for (let k = Math.min(exclude.length, pool.length - PUZZLE_SIZE); k >= 0; k--) {
    const drop = new Set(exclude.slice(0, k));
    chosenSet = pickSpreadSet(
      pool.filter((m) => !drop.has(m.id)),
      rng
    );
    if (chosenSet) break;
  }
  if (!chosenSet) {
    throw new Error("Could not assemble a spread-out puzzle right now.");
  }

  // highest -> lowest probability (position 1 = most likely, shown at top)
  const chosen = chosenSet.sort((a, b) => b.probability - a.probability);

  const order = chosen.map((m) => m.id);
  const probs: Record<string, number> = {};
  for (const m of chosen) probs[m.id] = m.probability;

  const items: PuzzleItem[] = chosen.map((m) => ({
    id: m.id,
    question: m.question,
    url: m.url,
  }));

  const payload: PuzzlePayload = { puzzleId, order, probs, items };
  return toPublicPuzzle(payload, seed ^ 0x9e3779b9);
}

// Build the client-facing puzzle from a (correct-order) payload. The display
// order is shuffled deterministically from `displaySeed` so a shared puzzle
// starts identically for everyone. Probabilities never leave the signed token.
export function toPublicPuzzle(
  payload: PuzzlePayload,
  displaySeed: number,
  code?: string
): PublicPuzzle {
  const displayItems = shuffle(payload.items, makeRng(displaySeed >>> 0));
  return {
    puzzleId: payload.puzzleId,
    size: PUZZLE_SIZE,
    maxGuesses: MAX_GUESSES,
    items: displayItems,
    token: encodeToken(payload),
    code,
  };
}

// Reconstruct a shared puzzle from its stored snapshot.
export function sharedPuzzle(payload: PuzzlePayload, code: string): PublicPuzzle {
  return toPublicPuzzle(payload, hashStr(code), code);
}

export type SlotFeedback = "correct" | "incorrect";

export interface RevealItem {
  id: string;
  question: string;
  url: string;
  probability: number;
}

export interface ScoreResult {
  feedback: SlotFeedback[]; // per slot, in the player's submitted order
  correctCount: number;
  solved: boolean;
  reveal?: RevealItem[]; // only when solved or reveal requested
}

// Score a guess: `guess` is market ids in the player's order, index 0 = the
// slot they think is MOST likely (top).
export function scoreGuess(
  payload: PuzzlePayload,
  guess: string[],
  reveal: boolean
): ScoreResult {
  const correctIndex: Record<string, number> = {};
  payload.order.forEach((id, i) => (correctIndex[id] = i));

  const feedback: SlotFeedback[] = guess.map((id, pos) =>
    correctIndex[id] === pos ? "correct" : "incorrect"
  );

  const correctCount = feedback.filter((f) => f === "correct").length;
  const solved = correctCount === payload.order.length;

  const result: ScoreResult = { feedback, correctCount, solved };

  if (solved || reveal) {
    result.reveal = payload.order.map((id) => {
      const item = payload.items.find((it) => it.id === id)!;
      return { id, question: item.question, url: item.url, probability: payload.probs[id] };
    });
  }

  return result;
}
