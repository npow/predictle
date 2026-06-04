import { describe, it, expect } from "vitest";
import { sanitizeCode } from "../lib/store";

describe("sanitizeCode", () => {
  it("accepts valid 6-char codes and normalizes them", () => {
    expect(sanitizeCode("abc234")).toBe("ABC234");
    expect(sanitizeCode(" 93pg33 ")).toBe("93PG33");
  });

  it("rejects ambiguous letters not in the alphabet", () => {
    expect(sanitizeCode("ABC23O")).toBeNull(); // O
    expect(sanitizeCode("ABC23I")).toBeNull(); // I
    expect(sanitizeCode("ABC23L")).toBeNull(); // L
    expect(sanitizeCode("ABC23U")).toBeNull(); // U
  });

  it("rejects wrong lengths and bad characters", () => {
    expect(sanitizeCode("ABC2")).toBeNull();
    expect(sanitizeCode("ABC2345")).toBeNull();
    expect(sanitizeCode("ABC23!")).toBeNull();
    expect(sanitizeCode("ABC230")).toBeNull(); // 0 not allowed
  });
});
