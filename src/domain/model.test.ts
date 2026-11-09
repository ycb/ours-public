import { describe, expect, it } from "vitest";
import {
  ITEM_LIMITS,
  deriveRouletteState,
  deriveViewerStage,
  hasUnreadMessages,
  type RouletteDecision,
  validateItemDraft,
} from "./model";

const A = "00000000-0000-4000-8000-0000000000a0";
const B = "00000000-0000-4000-8000-0000000000b0";
const CAT_1 = "00000000-0000-4000-8000-00000000c001";
describe("deriveRouletteState", () => {
  it("is pending until both partners decide", () => {
    expect(deriveRouletteState(["pending", "pending"])).toBe("pending");
    expect(deriveRouletteState(["ready", "pending"])).toBe("pending");
  });

  it("is ready only when both partners are ready", () => {
    expect(deriveRouletteState(["ready", "ready"])).toBe("ready");
  });

  it("is Later only when both say Later (QA 2026-11-03: Later is mutual)", () => {
    expect(deriveRouletteState(["not_now", "not_now"])).toBe("not_now");
    expect(deriveRouletteState(["ready", "not_now"])).toBe("pending");
    expect(deriveRouletteState(["not_now", "pending"])).toBe("pending");
  });

  it("is never ready without exactly two decisions", () => {
    expect(deriveRouletteState(["ready"])).toBe("pending");
    expect(deriveRouletteState([])).toBe("pending");
    expect(deriveRouletteState(["ready", "ready", "ready"])).toBe("pending");
  });
});

describe("validateItemDraft", () => {
  it("requires a trimmed title and a category; the description is optional (quick add)", () => {
    expect(validateItemDraft({ title: "  ", description: "", categoryId: "" })).toEqual({
      title: "required",
      categoryId: "required",
    });
    expect(validateItemDraft({ title: "Synthetic", description: "  ", categoryId: "00000000-0000-4000-8000-00000000c001" })).toEqual({});
  });

  it("enforces the database length bounds after trimming", () => {
    expect(
      validateItemDraft({
        title: "x".repeat(ITEM_LIMITS.title + 1),
        description: "y".repeat(ITEM_LIMITS.description + 1),
        categoryId: CAT_1,
      }),
    ).toEqual({ title: "too_long", description: "too_long" });
    expect(
      validateItemDraft({ title: `  ${"x".repeat(ITEM_LIMITS.title)}  `, description: "ok", categoryId: CAT_1 }),
    ).toEqual({});
  });
});

describe("deriveViewerStage", () => {
  const me = A;
  const decisions = (mine: RouletteDecision, theirs: RouletteDecision) => [
    { member_id: A, interest: null, is_favorite: false, roulette_decision: mine },
    { member_id: B, interest: null, is_favorite: false, roulette_decision: theirs },
  ];
  const stage = (overrides: Partial<Parameters<typeof deriveViewerStage>[0]>) =>
    deriveViewerStage({
      status: "submitted",
      creatorId: B,
      responses: decisions("pending", "ready"),
      memberId: me,
      seenAt: null,
      ...overrides,
    });

  it("is draft for an unshared item", () => {
    expect(stage({ status: "draft", creatorId: A })).toBe("draft");
  });
  it("is new for a partner's item I have never opened", () => {
    expect(stage({})).toBe("new");
  });
  it("needs my decision once opened", () => {
    expect(stage({ seenAt: "2026-01-01T00:00:00Z" })).toBe("needs_decision");
  });
  it("needs my decision when my partner edited my item", () => {
    expect(stage({ creatorId: A, seenAt: "2026-01-01T00:00:00Z" })).toBe("needs_decision");
  });
  it("is waiting when I am ready and my partner is not", () => {
    expect(stage({ creatorId: A, responses: decisions("ready", "pending") })).toBe("waiting");
  });
  it("is ready when both are ready", () => {
    expect(stage({ responses: decisions("ready", "ready") })).toBe("ready");
  });
  it("is Later only when both chose Later", () => {
    expect(stage({ responses: decisions("not_now", "not_now") })).toBe("not_now");
  });
  it("makes a one-sided Later the other person's turn, and the suggester waits", () => {
    expect(stage({ responses: decisions("ready", "not_now"), seenAt: "2026-01-01T00:00:00Z" })).toBe("needs_decision");
    expect(stage({ responses: decisions("pending", "not_now"), seenAt: "2026-01-01T00:00:00Z" })).toBe("needs_decision");
    expect(stage({ responses: decisions("not_now", "ready") })).toBe("waiting");
    expect(stage({ responses: decisions("not_now", "pending") })).toBe("waiting");
  });
});

describe("hasUnreadMessages", () => {
  const stamps = [
    { item_id: "i1", author_member_id: B, created_at: "2026-01-05T00:00:00Z" },
    { item_id: "i1", author_member_id: A, created_at: "2026-01-06T00:00:00Z" },
  ];
  it("counts partner messages newer than my last visit", () => {
    expect(hasUnreadMessages(stamps, A, "2026-01-04T00:00:00Z")).toBe(true);
    expect(hasUnreadMessages(stamps, A, "2026-01-05T00:00:00Z")).toBe(false);
  });
  it("treats any partner message as unread if I never opened the item", () => {
    expect(hasUnreadMessages(stamps, A, null)).toBe(true);
  });
  it("never counts my own messages", () => {
    expect(hasUnreadMessages(stamps.filter((stamp) => stamp.author_member_id === A), A, null)).toBe(false);
  });
});
