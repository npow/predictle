// Replicates the original Predictle's LLM question-quality filter
// (backend/api/src/get-predictle-markets.ts → isMarketQuestionClear /
// filterMarketsForQuality), keeping the prompt verbatim.
//
// The original used Gemini Flash; here we call any Anthropic-compatible endpoint
// (e.g. the local Kompact proxy) configured via env. If no token is configured,
// the filter is disabled and every question is treated as clear — matching the
// original's "on error, assume the question is fine" fallback.

interface Vettable {
  id: string;
  question: string;
}

const TOKEN = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
const BASE = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
const MODEL = process.env.PREDICTLE_LLM_MODEL || "claude-haiku-4-5";

export const clarityEnabled =
  process.env.PREDICTLE_LLM_FILTER !== "0" && !!TOKEN;

// The original used 10; we vet with more concurrency since this only happens
// once per server lifetime (per-question verdicts are cached below).
const BATCH_SIZE = 20;

// Permanent in-memory cache so each market's question is vetted at most once per
// server lifetime, regardless of how many puzzles are generated.
const cache = new Map<string, boolean>();

function prompt(question: string): string {
  return `### Role
You are an expert Prediction Market Quality Controller. Your task is to determine if a question is tradable.

### Evaluation Criteria
A question is tradable (Output: Yes) ONLY if it meets all three:
1. **Objective:** Outcome depends on facts, not opinions.
2. **Specific:** Includes a clear deadline and a specific metric/source.
3. **Resolvable:** A stranger could look at a data source on the end date and give an indisputable answer.

A question is NOT tradable (Output: No) if it is Subjective, Vague, or lacks a clear timestamp/source.

### Output Format
Return ONLY the word "Yes" or "No". Do not include any other text, punctuation, or explanation.

### Examples
Input: "Will Venezuelans be better off at the end of 2026?"
Output: No

Input: "Will Trump finish his second term?"
Output: Yes

Input: "Will Elon Musk tweet something funny this week?"
Output: No

Input: "Bitcoin $95K in January?"
Output: Yes

### Evaluation Task
Input: "${question}"
Output: `;
}

async function isClear(question: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": TOKEN!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 5,
        messages: [{ role: "user", content: prompt(question) }],
      }),
    });
    if (!res.ok) return true; // fail open, like the original
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    return text.toLowerCase().trim().startsWith("yes");
  } catch {
    return true; // on error, assume the question is fine
  }
}

// Vet markets in (importance) order until `target` clear questions are found.
export async function vetMarkets<T extends Vettable>(
  markets: T[],
  target: number
): Promise<T[]> {
  if (!clarityEnabled) return markets.slice(0, target);

  const kept: T[] = [];
  for (let i = 0; i < markets.length && kept.length < target; i += BATCH_SIZE) {
    const batch = markets.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (m) => {
        if (cache.has(m.id)) return { m, ok: cache.get(m.id)! };
        const ok = await isClear(m.question);
        cache.set(m.id, ok);
        return { m, ok };
      })
    );
    for (const { m, ok } of results) {
      if (ok && kept.length < target) kept.push(m);
    }
  }
  return kept;
}
