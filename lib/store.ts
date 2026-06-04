// Tiny file-based store for shared puzzles. Each shared puzzle gets a short
// code that maps to a frozen snapshot (markets + probabilities at share time),
// so a shared link plays identically for everyone, forever.
//
// File-based persistence is fine for local/single-instance use. For a
// serverless/multi-instance deploy, swap these two functions for a KV store
// (Vercel KV, Upstash, Redis, a DB table, …) — the interface is all you need.

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import type { PuzzlePayload } from "./puzzle";

const DIR = path.join(process.cwd(), ".predictle", "shares");

// Crockford-ish alphabet: no 0/1/I/L/O/U to avoid ambiguity when typing codes.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 6;

function makeCode(): string {
  const bytes = crypto.randomBytes(CODE_LEN);
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

// Matches ALPHABET exactly: digits 2-9 and letters minus I, L, O, U.
export const CODE_RE = /^[2-9A-HJKMNP-TV-Z]{6}$/;

export function sanitizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

export async function saveShare(payload: PuzzlePayload): Promise<string> {
  await fs.mkdir(DIR, { recursive: true });
  // Retry on the (astronomically unlikely) collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode();
    const file = path.join(DIR, `${code}.json`);
    try {
      // wx = fail if it already exists
      await fs.writeFile(file, JSON.stringify({ ...payload, code }), { flag: "wx" });
      return code;
    } catch {
      // collision or transient error — try another code
    }
  }
  throw new Error("Could not allocate a share code");
}

export async function loadShare(code: string): Promise<PuzzlePayload | null> {
  const clean = sanitizeCode(code);
  if (!clean) return null;
  try {
    const raw = await fs.readFile(path.join(DIR, `${clean}.json`), "utf8");
    return JSON.parse(raw) as PuzzlePayload;
  } catch {
    return null;
  }
}
