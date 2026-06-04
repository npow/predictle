import { NextRequest, NextResponse } from "next/server";
import { generatePuzzle, sharedPuzzle } from "@/lib/puzzle";
import { loadShare } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  // Shared puzzle: load the exact frozen snapshot for this code.
  if (code) {
    const payload = await loadShare(code);
    if (!payload) {
      return NextResponse.json({ error: "Puzzle code not found" }, { status: 404 });
    }
    return NextResponse.json(sharedPuzzle(payload, code.trim().toUpperCase()));
  }

  // Random puzzle: avoid recently-seen markets (dedupe over long play).
  const excludeParam = req.nextUrl.searchParams.get("exclude") ?? "";
  const exclude = excludeParam.split(",").filter(Boolean).slice(0, 200);
  try {
    const puzzle = await generatePuzzle(exclude);
    return NextResponse.json(puzzle);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to build puzzle" },
      { status: 502 }
    );
  }
}
