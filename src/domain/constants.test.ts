import { describe, expect, it } from "vitest";
import { INTEREST_OPTIONS, ROULETTE_OPTIONS } from "./constants";

describe("first-loop copy", () => {
  it("keeps interest distinct from roulette readiness", () => {
    expect(INTEREST_OPTIONS.map((option) => option.value)).toEqual([
      "low",
      "curious",
      "into_it",
      "very_into_it",
    ]);
    expect(ROULETTE_OPTIONS.map((option) => option.value)).toEqual([
      "pending",
      "ready",
      "not_now",
    ]);
  });
});
