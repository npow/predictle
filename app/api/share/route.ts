import { NextRequest, NextResponse } from "next/server";
import { decodeToken } from "@/lib/puzzle";
import { saveShare } from "@/lib/store";

export const dynamic = "force-dynamic";

// Mint a short code for the current puzzle so a friend can play the exact same
// one (markets + probabilities frozen at share time).
export async function POST(req: NextRequest) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const payload = body.token ? decodeToken(body.token) : null;
  if (!payload) {
    return NextResponse.json({ error: "Invalid or tampered token" }, { status: 400 });
  }

  try {
    const code = await saveShare(payload);
    return NextResponse.json({ code });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create share code" },
      { status: 500 }
    );
  }
}
