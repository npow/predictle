import { NextRequest, NextResponse } from "next/server";
import { decodeToken, scoreGuess } from "@/lib/puzzle";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { token?: string; guess?: string[]; reveal?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { token, guess, reveal } = body;
  if (!token || !Array.isArray(guess)) {
    return NextResponse.json({ error: "Missing token or guess" }, { status: 400 });
  }

  const payload = decodeToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or tampered token" }, { status: 400 });
  }

  // Validate the guess is a permutation of the puzzle's ids.
  const expected = new Set(payload.order);
  if (
    guess.length !== payload.order.length ||
    new Set(guess).size !== guess.length ||
    !guess.every((id) => expected.has(id))
  ) {
    return NextResponse.json({ error: "Guess must rank every market once" }, { status: 400 });
  }

  return NextResponse.json(scoreGuess(payload, guess, !!reveal));
}
