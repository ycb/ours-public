import { describe, expect, it } from "vitest";
import {
  buildInbox,
  formatAgo,
  formatRelative,
  latestActivity,
  parseIdeaFilters,
  parseIdeaView,
  selectIdeaView,
  serializeIdeaFilters,
  standing,
  tabAttention,
  filterOptions,
  viewCounts,
  type ActivityMessage,
  type ActivityRevision,
  type InboxEntry,
} from "./inbox";
import type { LibraryItem, ViewerStage } from "./model";

const ME = "00000000-0000-4000-8000-0000000000a0";
const P = "00000000-0000-4000-8000-0000000000b0";
const CAT_1 = "00000000-0000-4000-8000-00000000c001";
const CAT_2 = "00000000-0000-4000-8000-00000000c002";
const NOW = new Date("2026-03-10T12:00:00Z");

function item(overrides: Partial<LibraryItem> & { id?: string } = {}): LibraryItem {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Synthetic",
    status: "submitted",
    submitted_at: "2026-03-01T10:00:00Z",
    category_id: CAT_1,
    creator_member_id: ME,
    created_at: "2026-03-01T09:00:00Z",
    updated_at: "2026-03-01T10:00:00Z",
    archived_at: null,
    responses: [
      { member_id: ME, interest: null, is_favorite: false, roulette_decision: "ready" },
      { member_id: P, interest: null, is_favorite: false, roulette_decision: "pending" },
    ],
    ...overrides,
  };
}

const activity = (
  overrides: Partial<Parameters<typeof latestActivity>[0]> & { stage: ViewerStage },
) =>
  latestActivity({
    item: item(),
    revisions: [],
    messages: [],
    me: ME,
    partnerName: "Alex",
    now: NOW,
    ...overrides,
  });

const rev = (editor: string, n: number, at: string): ActivityRevision => ({
  editor_member_id: editor,
  revision_number: n,
  created_at: at,
});
const msg = (author: string, body: string, at: string, kind: ActivityMessage["kind"] = "message"): ActivityMessage => ({
  author_member_id: author,
  body,
  created_at: at,
  kind,
});

describe("latestActivity", () => {
  it("on Plan, says what happened since you agreed: the latest pick, memory or message", () => {
    expect(activity({ stage: "ready" }).line).toBe("Not picked yet");
    const picks = [{ by: P, at: "2026-03-05T09:00:00Z" }];
    const memories = [{ by: ME, at: "2026-03-07T09:00:00Z" }];
    const messages = [msg(P, "that was fun", "2026-03-06T09:00:00Z")];
    expect(activity({ stage: "ready", picks })).toEqual({ at: "2026-03-05T09:00:00Z", line: "Alex picked it" });
    expect(activity({ stage: "ready", picks, messages })).toEqual({ at: "2026-03-06T09:00:00Z", line: "Alex: that was fun" });
    expect(activity({ stage: "ready", picks, messages, memories })).toEqual({ at: "2026-03-07T09:00:00Z", line: "You added a memory" });
    expect(activity({ stage: "ready", picks: [{ by: ME, at: "2026-03-05T09:00:00Z" }] }).line).toBe("You picked it");
    expect(activity({ stage: "ready", memories: [{ by: P, at: "2026-03-07T09:00:00Z" }] }).line).toBe("Alex added a memory");
  });

  it("describes drafts as private, with when they were edited", () => {
    const draft = item({ status: "draft", submitted_at: null, updated_at: "2026-03-10T08:00:00Z" });
    expect(activity({ item: draft, stage: "draft" })).toEqual({
      at: "2026-03-10T08:00:00Z",
      line: "Only you · edited today",
    });
    expect(activity({ item: { ...draft, updated_at: "2026-03-09T08:00:00Z" }, stage: "draft" }).line).toBe(
      "Only you · edited yesterday",
    );
    expect(activity({ item: { ...draft, updated_at: "2026-02-20T08:00:00Z" }, stage: "draft" }).line).toBe(
      "Only you · edited Feb 20",
    );
  });

  it("says only who shared it: ratings belong to the standing line", () => {
    const theirs = item({
      creator_member_id: P,
      responses: [
        { member_id: ME, interest: null, is_favorite: false, roulette_decision: "pending" },
        { member_id: P, interest: "very_into_it", is_favorite: false, roulette_decision: "ready" },
      ],
    });
    expect(activity({ item: theirs, stage: "new" })).toEqual({ at: "2026-03-01T10:00:00Z", line: "Alex shared this" });
    expect(activity({ stage: "waiting" }).line).toBe("You shared this");
    expect(activity({ item: item({ creator_member_id: P }), stage: "waiting" }).line).toBe("Alex shared this");
  });

  it("names a partner's edit of my wording, and my own edits", () => {
    const edits = [rev(ME, 1, "2026-03-01T09:00:00Z"), rev(P, 2, "2026-03-05T09:00:00Z")];
    expect(activity({ revisions: edits, stage: "needs_decision" })).toEqual({
      at: "2026-03-05T09:00:00Z",
      line: "Alex edited your wording",
    });
    const theirs = item({ creator_member_id: P });
    expect(activity({ item: theirs, revisions: [rev(P, 2, "2026-03-05T09:00:00Z")], stage: "needs_decision" }).line).toBe(
      "Alex edited this",
    );
    expect(activity({ revisions: [rev(ME, 2, "2026-03-05T09:00:00Z")], stage: "waiting" }).line).toBe("You edited this");
  });

  it("ignores revision 1, which is the original wording", () => {
    expect(activity({ revisions: [rev(P, 1, "2026-03-09T09:00:00Z")], stage: "waiting" }).line).toBe("You shared this");
  });

  it("shows the latest message with who wrote it", () => {
    const messages = [msg(P, "Earlier", "2026-03-02T09:00:00Z"), msg(ME, "which book were you thinking of?", "2026-03-07T09:00:00Z")];
    expect(activity({ messages, stage: "waiting" })).toEqual({
      at: "2026-03-07T09:00:00Z",
      line: "You: which book were you thinking of?",
    });
    expect(activity({ messages: [msg(P, "Yes!", "2026-03-08T09:00:00Z")], stage: "waiting" }).line).toBe("Alex: Yes!");
  });

  it("collapses whitespace in message previews", () => {
    expect(activity({ messages: [msg(P, "two\n\nlines", "2026-03-08T09:00:00Z")], stage: "waiting" }).line).toBe(
      "Alex: two lines",
    );
  });

  it("shows the latest word on a parked idea: the note, or a later reply", () => {
    const later = [
      msg(P, "maybe after the trip", "2026-03-04T09:00:00Z", "not_now_reason"),
      msg(ME, "back from the trip!", "2026-03-09T09:00:00Z"),
    ];
    expect(activity({ messages: later, stage: "not_now" })).toEqual({ at: "2026-03-09T09:00:00Z", line: "You: back from the trip!" });
    expect(activity({ messages: [], stage: "not_now" }).line).toBe("You both chose Later");
  });

  it("gives the note for Later and who gave it", () => {
    const messages = [msg(P, "maybe after the trip", "2026-03-04T09:00:00Z", "not_now_reason")];
    expect(activity({ messages, stage: "not_now" })).toEqual({ at: "2026-03-04T09:00:00Z", line: 'Alex: "maybe after the trip"' });
    expect(activity({ messages: [msg(ME, "not yet", "2026-03-04T09:00:00Z", "not_now_reason")], stage: "not_now" }).line).toBe(
      'You: "not yet"',
    );
  });

});

describe("standing", () => {
  const responses = (me: Partial<LibraryItem["responses"][number]>, partner: Partial<LibraryItem["responses"][number]>) => [
    { member_id: ME, interest: null, is_favorite: false, roulette_decision: "pending" as const, ...me },
    { member_id: P, interest: null, is_favorite: false, roulette_decision: "pending" as const, ...partner },
  ];
  const at = (overrides: Partial<InboxEntry>) => standing(entry("01", overrides), ME);

  it("puts them first, then me, with no names (line 2 already names the person)", () => {
    expect(
      at({
        stage: "new",
        yourTurn: true,
        item: item({ creator_member_id: P, responses: responses({ is_favorite: true }, { interest: "into_it", roulette_decision: "ready" }) }),
      }),
    ).toEqual({
      kind: "both",
      people: [
        { memberId: P, mine: false, state: "in", answer: "They're in", turn: false, rating: "into it", favorite: false },
        { memberId: ME, mine: true, state: "pending", answer: "Your turn", turn: true, rating: null, favorite: true },
      ],
    });
  });

  it("says each answer as a short phrase for them and for me", () => {
    const words = (me: Partial<LibraryItem["responses"][number]>, partner: Partial<LibraryItem["responses"][number]>, stage: ViewerStage = "waiting") => {
      const result = at({ stage, item: item({ responses: responses(me, partner) }) });
      return result.kind === "both" ? result.people.map((person) => `${person.state}: ${person.answer}`) : [];
    };
    expect(words({ roulette_decision: "ready" }, {})).toEqual(["pending: They haven't decided", "in: You're in"]);
    // A one-sided Later is a suggestion; it's in Later only when you both chose it.
    expect(words({ roulette_decision: "ready" }, { roulette_decision: "not_now" }, "waiting")).toEqual([
      "hold: They suggest Later",
      "in: You're in",
    ]);
    expect(words({ roulette_decision: "not_now" }, { roulette_decision: "ready" }, "waiting")).toEqual([
      "in: They're in",
      "hold: You suggested Later",
    ]);
    expect(words({ roulette_decision: "not_now" }, { roulette_decision: "not_now" }, "not_now")).toEqual([
      "hold: They chose Later",
      "hold: You chose Later",
    ]);
  });

  it("collapses to Both in once agreed, and says nothing for drafts", () => {
    expect(at({ stage: "ready" })).toEqual({ kind: "agreed" });
    expect(at({ stage: "draft" })).toEqual({ kind: "none" });
  });
});


describe("formatAgo", () => {
  it("reads naturally in a byline", () => {
    expect(formatAgo("2026-03-10T11:59:40Z", NOW)).toBe("just now");
    expect(formatAgo("2026-03-10T11:15:00Z", NOW)).toBe("45m ago");
    expect(formatAgo("2026-03-10T07:00:00Z", NOW)).toBe("5h ago");
    expect(formatAgo("2026-03-07T12:00:00Z", NOW)).toMatch(/^on (Fri|Sat)$/);
    expect(formatAgo("2026-02-20T12:00:00Z", NOW)).toBe("on Feb 20");
  });
});

describe("formatRelative", () => {
  it("uses minutes, hours, weekday, then a date", () => {
    expect(formatRelative("2026-03-10T11:59:40Z", NOW)).toBe("now");
    expect(formatRelative("2026-03-10T11:15:00Z", NOW)).toBe("45m");
    expect(formatRelative("2026-03-10T07:00:00Z", NOW)).toBe("5h");
    expect(formatRelative("2026-03-07T12:00:00Z", NOW)).toMatch(/^(Fri|Sat)$/);
    expect(formatRelative("2026-02-20T12:00:00Z", NOW)).toBe("Feb 20");
  });
});

const entry = (id: string, overrides: Partial<InboxEntry> = {}): InboxEntry => ({
  item: item({ id: `00000000-0000-4000-8000-0000000000${id}` }),
  stage: "waiting",
  unread: false,
  yourTurn: false,
  activity: { at: "2026-03-01T10:00:00Z", line: "" },
  ...overrides,
});
const short = (entries: InboxEntry[]) => entries.map((e) => e.item.id.slice(-2));

describe("buildInbox", () => {
  it("keeps my turn separate from unread", () => {
    const theirs = item({
      id: "00000000-0000-4000-8000-000000000011",
      creator_member_id: P,
      responses: [
        { member_id: ME, interest: null, is_favorite: false, roulette_decision: "pending" },
        { member_id: P, interest: null, is_favorite: false, roulette_decision: "ready" },
      ],
    });
    const mineWaiting = item({ id: "00000000-0000-4000-8000-000000000012" });
    const archived = item({ id: "00000000-0000-4000-8000-000000000013", archived_at: "2026-03-02T00:00:00Z" });
    const inbox = buildInbox({
      items: [theirs, mineWaiting, archived],
      views: [],
      messages: [{ item_id: mineWaiting.id, author_member_id: P, body: "hi", kind: "message", created_at: "2026-03-03T00:00:00Z" }],
      revisions: [],
      me: ME,
      partnerName: "Alex",
      now: NOW,
    });
    // [id, stage, unread, yourTurn]: a new idea is both; a reply while I wait is only unread.
    expect(inbox.map((e) => [e.item.id.slice(-2), e.stage, e.unread, e.yourTurn])).toEqual([
      ["12", "waiting", true, false],
      ["11", "new", true, true],
    ]);
  });
});

describe("selectIdeaView", () => {
  const list = [
    entry("01", { stage: "draft", activity: { at: "2026-03-05T00:00:00Z", line: "" } }),
    entry("02", { stage: "new", yourTurn: true, unread: true, activity: { at: "2026-03-04T00:00:00Z", line: "" } }),
    entry("03", { stage: "waiting", activity: { at: "2026-03-06T00:00:00Z", line: "" } }),
    entry("04", { stage: "ready", activity: { at: "2026-03-07T00:00:00Z", line: "" } }),
    entry("05", { stage: "not_now", activity: { at: "2026-03-08T00:00:00Z", line: "" } }),
    entry("06", { stage: "ready", unread: true, activity: { at: "2026-03-09T00:00:00Z", line: "" } }),
    entry("09", { stage: "not_now", unread: true, activity: { at: "2026-03-02T00:00:00Z", line: "" } }),
  ];

  it("Ideas pins my turn, then lists the rest by latest activity; Later holds what's parked", () => {
    // 02 is my turn (pinned above newer 03). 05 and 09 are parked, so they live in Later, unread or not.
    expect(short(selectIdeaView(list, "ideas", {}))).toEqual(["02", "03"]);
    expect(short(selectIdeaView(list, "later", {}))).toEqual(["05", "09"]);
  });

  it("opens Later from ?view=later, and from old ?notnow=1 links", () => {
    expect(parseIdeaView(new URLSearchParams("view=later"))).toBe("later");
    expect(parseIdeaView(new URLSearchParams("notnow=1"))).toBe("later");
    expect(parseIdeaView(new URLSearchParams("view=drafts&notnow=1"))).toBe("drafts");
    expect(parseIdeaView(new URLSearchParams(""))).toBe("ideas");
  });

  it("counts each view, and every agreed idea for Plan", () => {
    expect(viewCounts(list)).toEqual({
      ideas: selectIdeaView(list, "ideas", {}).length,
      later: 2,
      drafts: selectIdeaView(list, "drafts", {}).length,
      agreed: selectIdeaView(list, "agreed", {}).length,
    });
    expect(viewCounts([])).toEqual({ ideas: 0, later: 0, drafts: 0, agreed: 0 });
  });

  it("puts a dot on Ideas for my turn or unread, and on Plan for unread agreed ideas", () => {
    expect(tabAttention(list)).toEqual({ ideas: true, plan: true });
    expect(tabAttention([entry("03"), entry("04", { stage: "ready" })])).toEqual({ ideas: false, plan: false });
    expect(tabAttention([entry("03", { unread: true })])).toEqual({ ideas: true, plan: false });
  });

  it("Drafts shows only drafts", () => {
    expect(short(selectIdeaView(list, "drafts", {}))).toEqual(["01"]);
  });

  it("Plan shows agreed ideas", () => {
    expect(short(selectIdeaView(list, "agreed", {}))).toEqual(["06", "04"]);
  });

  it("applies category and favorites filters (a favorite of either of you)", () => {
    const withCat = [
      entry("07", { item: { ...item({ id: "00000000-0000-4000-8000-000000000007" }), category_id: CAT_2 } }),
      entry("08", {
        item: item({
          id: "00000000-0000-4000-8000-000000000008",
          responses: [
            { member_id: ME, interest: "curious", is_favorite: true, roulette_decision: "ready" },
            { member_id: P, interest: "into_it", is_favorite: true, roulette_decision: "pending" },
          ],
        }),
      }),
    ];
    expect(short(selectIdeaView(withCat, "ideas", { category: CAT_2 }))).toEqual(["07"]);
    expect(short(selectIdeaView(withCat, "ideas", { favorites: true }))).toEqual(["08"]);
    expect(short(selectIdeaView(withCat, "ideas", { category: CAT_2, favorites: true }))).toEqual([]);
    const partnerOnly = entry("09", {
      item: item({
        id: "00000000-0000-4000-8000-000000000009",
        responses: [
          { member_id: ME, interest: null, is_favorite: false, roulette_decision: "ready" },
          { member_id: P, interest: null, is_favorite: true, roulette_decision: "pending" },
        ],
      }),
    });
    expect(short(selectIdeaView([...withCat, partnerOnly], "ideas", { favorites: true })).sort()).toEqual(["08", "09"]);
  });

  it("offers only the pills that match something, plus whatever is already chosen", () => {
    const list = [
      entry("07", { item: { ...item({ id: "00000000-0000-4000-8000-000000000007" }), category_id: CAT_2 } }),
      entry("08", { item: { ...item({ id: "00000000-0000-4000-8000-000000000008" }), category_id: CAT_2 } }),
    ];
    const categories = [
      { id: CAT_1, name: "One" },
      { id: CAT_2, name: "Two" },
    ];
    expect(filterOptions(list, categories, {})).toEqual({ categories: [{ id: CAT_2, name: "Two" }], favorites: false });
    expect(filterOptions(list, categories, { category: CAT_1, favorites: true })).toEqual({ categories, favorites: true });
    expect(filterOptions([], categories, {})).toEqual({ categories: [], favorites: false });
  });
});

describe("URL state", () => {
  it("parses views, defaulting to ideas", () => {
    expect(parseIdeaView(new URLSearchParams("view=respond"))).toBe("ideas");
    expect(parseIdeaView(new URLSearchParams("view=drafts"))).toBe("drafts");
    expect(parseIdeaView(new URLSearchParams("view=nope"))).toBe("ideas");
    expect(parseIdeaView(new URLSearchParams(""))).toBe("ideas");
  });

  it("keeps only ids and enums in filters and round-trips them", () => {
    const params = new URLSearchParams(
      `view=drafts&category=${CAT_1}&interest=${P}:into_it&favorite=1&notnow=1&creator=${P}&title=secret`,
    );
    const filters = parseIdeaFilters(params);
    // The interest filter is retired (QA 8): old links simply drop it.
    expect(filters).toEqual({ category: CAT_1, favorites: true });
    expect(serializeIdeaFilters(filters, "drafts").toString()).toBe(`view=drafts&category=${CAT_1}&favorite=1`);
    // Old per-partner and "both" favorite links still mean favorites.
    expect(parseIdeaFilters(new URLSearchParams("favorite=both"))).toEqual({ favorites: true });
    expect(parseIdeaFilters(new URLSearchParams(`favorite=${P}`))).toEqual({ favorites: true });
    expect(parseIdeaFilters(new URLSearchParams("category=not-a-uuid&interest=x:y&favorite=z"))).toEqual({});
    expect(serializeIdeaFilters({}, "ideas").toString()).toBe("");
  });
});
