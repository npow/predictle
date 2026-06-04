import { describe, it, expect } from "vitest";
import {
  toPublicPuzzle,
  decodeToken,
  scoreGuess,
  sharedPuzzle,
  type PuzzlePayload,
} from "../lib/puzzle";

// A fixed payload: order is highest -> lowest probability.
const payload: PuzzlePayload = {
  puzzleId: "test1",
  order: ["a", "b", "c", "d", "e"],
  probs: { a: 0.9, b: 0.7, c: 0.5, d: 0.3, e: 0.1 },
  items: ["a", "b", "c", "d", "e"].map((id) => ({
    id,
    question: `Question ${id}?`,
    url: `https://manifold.markets/${id}`,
  })),
};

describe("token signing", () => {
  it("round-trips through sign/verify", () => {
    const pub = toPublicPuzzle(payload, 123);
    expect(decodeToken(pub.token)?.order).toEqual(payload.order);
  });

  it("rejects tampered tokens", () => {
    const pub = toPublicPuzzle(payload, 1);
    expect(decodeToken(pub.token + "x")).toBeNull();
    const flipped = pub.token.slice(0, -1) + (pub.token.endsWith("A") ? "B" : "A");
    expect(decodeToken(flipped)).toBeNull();
  });

  it("never leaks probabilities to the client", () => {
    const pub = toPublicPuzzle(payload, 1);
    for (const item of pub.items) {
      expect(item).not.toHaveProperty("probability");
    }
    expect(JSON.stringify(pub.items)).not.toContain("0.9");
  });
});

describe("display shuffle", () => {
  it("is deterministic for a given seed", () => {
    const a = toPublicPuzzle(payload, 42).items.map((i) => i.id);
    const b = toPublicPuzzle(payload, 42).items.map((i) => i.id);
    expect(a).toEqual(b);
  });

  it("is always a permutation of every item", () => {
    const ids = toPublicPuzzle(payload, 7).items.map((i) => i.id).sort();
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("sharedPuzzle", () => {
  it("reproduces the same display order for the same code", () => {
    const a = sharedPuzzle(payload, "ABC234");
    const b = sharedPuzzle(payload, "ABC234");
    expect(a.items.map((i) => i.id)).toEqual(b.items.map((i) => i.id));
    expect(a.code).toBe("ABC234");
  });
});

describe("scoreGuess", () => {
  it("solves when the guess matches the order", () => {
    const r = scoreGuess(payload, ["a", "b", "c", "d", "e"], false);
    expect(r.solved).toBe(true);
    expect(r.correctCount).toBe(5);
    expect(r.feedback.every((f) => f === "correct")).toBe(true);
    expect(r.reveal).toBeDefined(); // a solve always reveals the answer
  });

  it("marks only out-of-place slots incorrect", () => {
    const r = scoreGuess(payload, ["b", "a", "c", "d", "e"], false);
    expect(r.solved).toBe(false);
    expect(r.correctCount).toBe(3);
    expect(r.feedback).toEqual([
      "incorrect",
      "incorrect",
      "correct",
      "correct",
      "correct",
    ]);
    expect(r.reveal).toBeUndefined(); // hidden unless solved or requested
  });

  it("reveals probabilities when explicitly requested", () => {
    const r = scoreGuess(payload, ["b", "a", "c", "d", "e"], true);
    expect(r.reveal).toHaveLength(5);
    expect(r.reveal?.[0]).toMatchObject({ id: "a", probability: 0.9 });
  });
});
