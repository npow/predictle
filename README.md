# 🔮 Predictle

[![CI](https://github.com/npow/predictle/actions/workflows/ci.yml/badge.svg)](https://github.com/npow/predictle/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

Manifold's [Predictle](https://manifold.markets/predictle) gives you exactly **one** forecasting puzzle per day — then you wait until tomorrow. **This is Predictle without the wait:** an endless stream of puzzles built from live [Manifold](https://manifold.markets) prediction markets, plus shareable challenge links so you can race a friend on the same board.

It's a Wordle-style ranking game — you're shown 5 real markets and sort them from **most** to **least** likely.

## Play

- Drag the 5 markets into order from **highest** probability (top) to **lowest** (bottom). Neighbors shift live as you drag.
- Submit for per-row feedback: ✅ correct position · ❌ wrong. Correct rows lock in place. You get **4 guesses**.
- Feedback accumulates across attempts. Solve it (or run out) to reveal the real probabilities, then **share your result** or **🔗 challenge a friend** with the exact same puzzle.
- Out of guesses? There's always another — hit **Next puzzle →**.

## Matching the original's behavior

This clone replicates the original Predictle's mechanics, not just its look:

- **Eligibility** (`lib/manifold.ts`) mirrors the original's SQL filter: open, **BINARY**, `cpmm-1`, MANA token, probability **0.05–0.95**, **>20 unique bettors**, created >1 day ago, closes >7 days out (or never), excluding the same hidden group slugs (`lib/constants.ts`), ordered by Manifold's importance score.
- **Quality filter** (`lib/clarity.ts`) runs the original's *exact* LLM prompt ("is this question objective / specific / resolvable?") over candidates. Verdicts are cached per market for the server's lifetime, so the LLM is hit at most once per question.
- **Selection** (`lib/puzzle.ts`): shuffle, greedily take 5 markets each **≥5% apart**, sort **highest→lowest** for the answer — identical to the original's `prepareMarkets`.
- **Rules:** 4 guesses, ✅ correct / ❌ incorrect, correct rows lock, feedback accumulates per market — same as the original.

**Intentional differences from the original:** unlimited puzzles instead of one/day, and **dedupe** — the client tracks the last ~150 market ids (`predictle:recent`) and the server excludes as many as it can while still building a valid spread (gradual relaxation, no all-or-nothing reset). The candidate universe is built by unioning several Manifold sort orders (~1,400 eligible markets) and quality-vetting up to ~250 into the working pool. Measured over 50 consecutive games: 195 distinct markets, **no repeat within 21 puzzles**. Repeats are inevitable eventually (Manifold has a finite set of quality markets), but they stay rare and well-spaced.

## Share a puzzle

Finish a puzzle → **🔗 Challenge a friend** mints a 6-character code and copies a link like `…/?game=93PG33`. Opening it (or typing the code into the "Enter a code" box) plays the **exact same puzzle** — same 5 markets, same probabilities frozen at share time, same starting order — so the answer matches for everyone. Codes are stored in `lib/store.ts` (file-based under `.predictle/shares/`; swap for a KV store in production).

## Architecture

- **`lib/manifold.ts`** — fetches the importance-ranked pool, applies the eligibility filter, vets via `clarity`, caches 10 min.
- **`lib/clarity.ts`** — LLM question-quality filter via any Anthropic-compatible endpoint (configured in `.env.local`); disabled gracefully if no token.
- **`lib/puzzle.ts`** — 5%-spread selection w/ dedupe exclusions, highest→lowest answer, **HMAC-signed tokens** so probabilities never reach the client until scoring.
- **`lib/store.ts`** — file-based store mapping 6-char codes → frozen puzzle snapshots (shared puzzles).
- **`app/api/puzzle`** — `?exclude=id,id,…` for a random puzzle, or `?code=ABC123` to load a shared one. Returns shuffled questions + signed token (no probabilities).
- **`app/api/share`** — `POST {token}` → mints and returns a 6-char share code.
- **`app/api/score`** — verifies the token, scores server-side (✅/❌), reveals answers on win/loss.
- **`app/page.tsx`** — game UI (`@hello-pangea/dnd` drag-to-rank, locking, accumulating feedback, prob reveal, share, dedupe window, localStorage stats).

## Run

```bash
npm run dev      # http://localhost:3000
npm run build && npm start
```

Config lives in `.env.local`:

```bash
# LLM quality filter (any Anthropic-compatible endpoint; here the local Kompact proxy)
ANTHROPIC_BASE_URL=http://127.0.0.1:7878
ANTHROPIC_AUTH_TOKEN=your-api-key-1
PREDICTLE_LLM_MODEL=claude-haiku-4-5-20251001
PREDICTLE_LLM_FILTER=1            # set to 0 to disable the LLM filter

PUZZLE_SECRET=$(openssl rand -hex 32)   # signs puzzle tokens
```

The first puzzle after a cold start spends a few seconds vetting the pool with the LLM; verdicts are cached afterward, so subsequent puzzles are instant. Copy `.env.example` to `.env.local` to get started.

## Tests

Pure game logic (scoring, token signing, the dedupe/share helpers) is covered by [Vitest](https://vitest.dev):

```bash
npm test          # run once
npm run typecheck # tsc --noEmit
npm run lint
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → tests → build on Node 20 and 22 for every push and PR.

## Notes / next steps

- The one filter the public API can't reproduce exactly is the hidden **group-slug** exclusion (lite markets don't expose `groupSlugs`); it's applied when present and otherwise skipped.
- Possible additions: an optional shareable **daily** puzzle (deterministic seed) for the social/viral hook, difficulty tiers, category filters, leaderboard, streaks.
