import { describe, expect, it } from "vitest";
import { reflectAfter, toReflect, upNext, whenLabel, type DateRow } from "./dates";

const ME = "00000000-0000-4000-8000-0000000000a0";
const P = "00000000-0000-4000-8000-0000000000b0";
const date = (id: string, overrides: Partial<DateRow> = {}): DateRow => ({
  id,
  item_id: `item-${id}`,
  drawn_by_member_id: ME,
  source: "deck",
  planned_when: null,
  reflect_after: null,
  done_at: null,
  cancelled_at: null,
  created_at: "2026-11-01T10:00:00Z",
  ...overrides,
});

describe("reflectAfter (local time)", () => {
  it("asks the morning after tonight, the Monday after a weekend, and only after We did it for sometime", () => {
    const wednesdayEvening = new Date(2026, 10, 4, 20, 30);
    expect(reflectAfter("tonight", wednesdayEvening)).toEqual(new Date(2026, 10, 5, 9, 0));
    expect(reflectAfter("weekend", wednesdayEvening)).toEqual(new Date(2026, 10, 9, 9, 0));
    const sunday = new Date(2026, 10, 8, 11, 0);
    expect(reflectAfter("weekend", sunday)).toEqual(new Date(2026, 10, 9, 9, 0));
    const monday = new Date(2026, 10, 9, 11, 0);
    expect(reflectAfter("weekend", monday)).toEqual(new Date(2026, 10, 16, 9, 0));
    expect(reflectAfter("sometime", wednesdayEvening)).toBeNull();
  });
});

describe("upNext and toReflect", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const rows = [
    date("open-old", { planned_when: "weekend", created_at: "2026-11-01T10:00:00Z" }),
    date("open-new", { planned_when: "tonight", created_at: "2026-11-09T10:00:00Z", reflect_after: "2026-11-11T09:00:00Z" }),
    date("done", { done_at: "2026-11-08T22:00:00Z" }),
    date("due", { planned_when: "tonight", reflect_after: "2026-11-10T09:00:00Z" }),
    date("off", { cancelled_at: "2026-11-02T10:00:00Z", reflect_after: "2026-11-03T09:00:00Z" }),
    date("reflected", { done_at: "2026-11-07T22:00:00Z" }),
  ];
  const memories = [{ draw_id: "reflected", author_member_id: ME }, { draw_id: "done", author_member_id: P }];

  it("lists open dates (not done, not called off, not yet due) newest first", () => {
    expect(upNext(rows, now).map((row) => row.id)).toEqual(["open-new", "open-old"]);
  });

  it("asks me about dates that are done or due, until I've reflected; my partner's reflection doesn't count for me", () => {
    expect(toReflect(rows, memories, ME, now).map((row) => row.id)).toEqual(["due", "done"]);
    expect(toReflect(rows, memories, P, now).map((row) => row.id)).toEqual(["due", "reflected"]);
  });

  it("names the when", () => {
    expect([whenLabel("tonight"), whenLabel("weekend"), whenLabel("sometime"), whenLabel(null)]).toEqual([
      "Tonight",
      "This weekend",
      "Sometime",
      "Sometime",
    ]);
  });
});
