import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  PARTNER_A,
  PARTNER_B,
  SYNTHETIC_COUPLE_ID,
  createFakeSupabase,
  renderApp,
  seedItem,
  type FakeDb,
} from "../../test/testUtils";

const A = PARTNER_A.member.id;
const B = PARTNER_B.member.id;
const id = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
const CAT_2 = "00000000-0000-4000-8000-00000000c002";
const CAT_1 = "00000000-0000-4000-8000-00000000c001";
type Decision = "pending" | "ready" | "not_now";

/** A realistic mix, seen from Partner A's side. Item n was shared on Jan n. */
function seed(): Partial<FakeDb> {
  const db: Partial<FakeDb> = { item_views: [], comments: [] };
  const add = (
    n: number,
    title: string,
    creator: string,
    a: Decision,
    b: Decision,
    extra: { status?: "draft" | "submitted"; seenByA?: boolean; categoryId?: string } = {},
  ) => {
    seedItem(db, {
      id: id(n),
      title,
      creatorId: creator,
      status: extra.status,
      categoryId: extra.categoryId,
      responses: { [A]: { roulette_decision: a }, [B]: { roulette_decision: b } },
    });
    const row = db.items!.find((item) => item.id === id(n))!;
    const at = `2026-01-0${n}T12:00:00Z`;
    Object.assign(row, { updated_at: at, submitted_at: row.status === "draft" ? null : at });
    if (extra.seenByA) {
      db.item_views!.push({
        couple_id: SYNTHETIC_COUPLE_ID,
        item_id: id(n),
        member_id: A,
        first_seen_at: "2026-01-11T00:00:00Z",
        last_seen_at: "2026-01-11T00:00:00Z",
      });
    }
  };
  add(1, "Synthetic Theirs New", B, "pending", "ready");
  add(2, "Synthetic Theirs Opened", B, "pending", "ready", { seenByA: true });
  add(3, "Synthetic Theirs Waiting", B, "ready", "pending", { seenByA: true, categoryId: CAT_2 });
  add(4, "Synthetic Mine Draft", A, "pending", "pending", { status: "draft" });
  add(5, "Synthetic Mine Waiting", A, "ready", "pending");
  add(6, "Synthetic Mine Co-edited", A, "pending", "ready", { seenByA: true });
  add(7, "Synthetic Ours Ready", B, "ready", "ready", { seenByA: true });
  // In Later: you both chose it (Later is mutual).
  add(8, "Synthetic Declined", A, "not_now", "not_now");
  // B suggested Later; A hasn't agreed, so it stays in Shared as A's turn.
  add(9, "Synthetic Suggested Later", A, "ready", "not_now", { seenByA: true });
  // seedItem created CAT_2 (for item 3) with the default name; give it its own.
  db.categories!.find((row) => row.id === CAT_2)!.name = "Synthetic Second";
  db.comments!.push(
    {
      id: "00000000-0000-4000-8000-0000000c0001",
      couple_id: SYNTHETIC_COUPLE_ID,
      item_id: id(7),
      author_member_id: B,
      body: "Synthetic message",
      request_id: "00000000-0000-4000-8000-0000000c0001",
      kind: "message",
      created_at: "2026-01-12T12:00:00Z",
    },
    {
      id: "00000000-0000-4000-8000-0000000c0002",
      couple_id: SYNTHETIC_COUPLE_ID,
      item_id: id(8),
      author_member_id: B,
      body: "Synthetic reason",
      request_id: "00000000-0000-4000-8000-0000000c0002",
      kind: "not_now_reason",
      created_at: "2026-01-08T13:00:00Z",
    },
  );
  // A read B's reason already, so the declined idea isn't waiting on A.
  db.item_views!.push({
    couple_id: SYNTHETIC_COUPLE_ID,
    item_id: id(8),
    member_id: A,
    first_seen_at: "2026-01-11T00:00:00Z",
    last_seen_at: "2026-01-11T00:00:00Z",
  });
  // B reworded A's idea.
  db.item_revisions!.push({
    id: "00000000-0000-4000-8000-00000000e006",
    couple_id: SYNTHETIC_COUPLE_ID,
    item_id: id(6),
    revision_number: 2,
    editor_member_id: B,
    title: "Synthetic Mine Co-edited",
    description: "Synthetic description A",
    category_id: "00000000-0000-4000-8000-00000000c001",
    created_at: "2026-01-09T12:00:00Z",
  });
  return db;
}

function setup(route: string, as = PARTNER_A, db = seed()) {
  const fake = createFakeSupabase({ signedInAs: as, db });
  return { ...fake, ...renderApp(fake.client, { route }), user: userEvent.setup() };
}

const rowTitles = async () => {
  const list = await screen.findByRole("list", { name: "Ideas" });
  return within(list)
    .queryAllByRole("link")
    .map((link) => link.querySelector(".idea-row-title")?.textContent);
};

describe("Ideas tab", () => {
  it("opens on Ideas from home, with Shared · Later · My drafts and a Plan tab, each dotted when something waits", async () => {
    const { router } = setup("/");
    const views = await screen.findByRole("navigation", { name: "Idea views" });
    expect(within(views).getAllByRole("link").map((link) => link.textContent)).toEqual([
      expect.stringMatching(/^Shared \d+$/),
      expect.stringMatching(/^Later \d+/),
      expect.stringMatching(/^My drafts \d+$/),
    ]);
    expect(within(views).getByRole("link", { name: /^Shared \d+$/ })).toHaveAttribute("aria-current", "page");
    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primary).getByRole("link", { name: /^Ideas \d+, something is waiting on you$/ })).toBeInTheDocument();
    // B replied on an agreed idea A hasn't reopened.
    expect(within(primary).getByRole("link", { name: /^Plan \d+, new messages$/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/ideas");
  });

  it("pins my turn to the top, then lists the rest by latest activity, without drafts or Later", async () => {
    setup("/ideas");
    expect(await rowTitles()).toEqual([
      "Synthetic Suggested Later",
      "Synthetic Mine Co-edited",
      "Synthetic Theirs Opened",
      "Synthetic Theirs New",
      "Synthetic Mine Waiting",
      "Synthetic Theirs Waiting",
    ]);
  });

  it("shows both partners in parallel under what happened last", async () => {
    const db = seed();
    const theirs = db.item_responses!.find((row) => row.item_id === id(1) && row.member_id === B)!;
    theirs.interest = "into_it";
    db.item_responses!.find((row) => row.item_id === id(1) && row.member_id === A)!.is_favorite = true;
    setup("/ideas", PARTNER_A, db);
    const row = await screen.findByRole("link", { name: /Synthetic Theirs New/ });
    expect(within(row).getByText("Synthetic Partner B shared this")).toHaveClass("idea-row-line");
    const people = within(row).getAllByRole("listitem").map((person) => person.textContent);
    expect(people).toEqual(["They're in · into it", "Your turn · ♥ favorite"]);
    expect(within(row).getByText("into it")).toHaveClass("row-interest");
    expect(within(row).getByText("Your turn")).toHaveClass("standing-turn");
    const [theirLine, myLine] = within(row).getAllByRole("listitem");
    // Colors belong to people, not to "me" and "partner": A is always person-a, B person-b.
    expect(theirLine).toHaveClass("person-b");
    expect(theirLine.querySelector(".person-mark")).toHaveClass("is-in");
    expect(myLine).toHaveClass("person-a");
    expect(row.closest("li")).toHaveClass("is-your-turn");
    expect(myLine.querySelector(".person-mark")).toHaveClass("is-pending");
    // Each person is named once: the event line names them; the standing line says "they" and "you".
    expect(row.textContent!.split("Synthetic Partner B")).toHaveLength(2);
  });

  it("marks my turn and unread separately, and says who did what last", async () => {
    setup("/ideas");
    const coEdited = await screen.findByRole("link", { name: /Synthetic Mine Co-edited/ });
    expect(coEdited).toHaveTextContent("Your turn");
    expect(coEdited).toHaveTextContent("Synthetic Partner B edited your wording");
    expect(coEdited).not.toHaveAccessibleName(/Unread/);
    expect(coEdited.closest("li")).toHaveClass("is-your-turn");
    const fresh = screen.getByRole("link", { name: /Synthetic Theirs New/ });
    expect(fresh).toHaveAccessibleName(/Your turn.*Unread/);
    expect(fresh.closest("li")).toHaveClass("is-your-turn", "is-unread");
    const waiting = screen.getByRole("link", { name: /Synthetic Mine Waiting/ });
    expect(waiting).toHaveTextContent("You shared this");
    expect(waiting).toHaveTextContent("They haven't decided");
    expect(waiting).not.toHaveAccessibleName(/Your turn|Unread/);
    const theirsWaiting = screen.getByRole("link", { name: /Synthetic Theirs Waiting/ });
    expect(theirsWaiting).toHaveTextContent("Synthetic Partner B shared this");
    expect(theirsWaiting).toHaveTextContent("You're in");
  });

  it("sends the retired Respond view to Ideas and drops the dots when nothing waits", async () => {
    const db: Partial<FakeDb> = {};
    seedItem(db, { title: "Synthetic Mine Waiting", creatorId: A, responses: { [A]: { roulette_decision: "ready" } } });
    setup("/ideas?view=respond", PARTNER_A, db);
    expect(await rowTitles()).toEqual(["Synthetic Mine Waiting"]);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primary).getByRole("link", { name: "Ideas 1" })).toBeInTheDocument();
    expect(within(primary).getByRole("link", { name: "Plan 0" })).toBeInTheDocument();
  });

  it("Drafts lists my drafts with a Share button that shares in place", async () => {
    const { user, db } = setup("/ideas?view=drafts");
    expect(await rowTitles()).toEqual(["Synthetic Mine Draft"]);
    expect(screen.getByRole("link", { name: /Synthetic Mine Draft/ })).toHaveTextContent("Only you · edited");
    await user.click(screen.getByRole("button", { name: "Share Synthetic Mine Draft with Synthetic Partner B" }));
    expect(await screen.findByText("No drafts")).toBeInTheDocument();
    expect(db.items.find((item) => item.id === id(4))?.status).toBe("submitted");
  });

  it("never shows my draft to my partner", async () => {
    setup("/ideas?view=drafts", PARTNER_B);
    expect(await screen.findByText("No drafts")).toBeInTheDocument();
    expect(screen.getByText(/Start one with/).querySelector("a")).toHaveAttribute("href", "/ideas/new");
    expect(screen.queryByText("Synthetic Mine Draft")).not.toBeInTheDocument();
  });

  it("Later lists what either of you parked, with its latest word, and Shared doesn't", async () => {
    const { user, router } = setup("/ideas");
    expect(await rowTitles()).not.toContain("Synthetic Declined");
    await user.click(within(screen.getByRole("navigation", { name: "Idea views" })).getByRole("link", { name: /^Later \d+/ }));
    expect(router.state.location.search).toBe("?view=later");
    const parked = await screen.findByRole("link", { name: /Synthetic Declined/ });
    expect(parked).toHaveTextContent('Synthetic Partner B: "Synthetic reason"');
    expect(parked).toHaveTextContent("They chose Later");
    expect(parked).toHaveTextContent("You chose Later");
    expect(await rowTitles()).toEqual(["Synthetic Declined"]);
  });

  it("keeps a one-sided Later in Shared as a suggestion, and makes it the other person's turn", async () => {
    setup("/ideas");
    const row = await screen.findByRole("link", { name: /Synthetic Suggested Later/ });
    expect(row).toHaveTextContent("They suggest Later");
    expect(row).toHaveTextContent("Your turn");
  });

  it("keeps old ?notnow=1 links working by opening Later", async () => {
    setup("/ideas?notnow=1");
    expect(await screen.findByRole("link", { name: /Synthetic Declined/ })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Idea views" })).getByRole("link", { name: /^Later \d+/ })).toHaveAttribute("aria-current", "page");
  });

  it("dots Later when your partner says something new about a parked idea", async () => {
    const db: Partial<FakeDb> = { item_views: [], comments: [] };
    seedItem(db, { id: id(1), title: "Synthetic Parked", creatorId: A, responses: { [A]: { roulette_decision: "not_now" }, [B]: { roulette_decision: "not_now" } } });
    db.comments!.push({
      id: "00000000-0000-4000-8000-0000000c0009",
      couple_id: SYNTHETIC_COUPLE_ID,
      item_id: id(1),
      author_member_id: A,
      body: "Synthetic follow-up",
      request_id: "00000000-0000-4000-8000-0000000c0009",
      kind: "message",
      created_at: "2026-01-20T12:00:00Z",
    });
    renderApp(createFakeSupabase({ signedInAs: PARTNER_B, db }).client, { route: "/ideas" });
    const views = await screen.findByRole("navigation", { name: "Idea views" });
    expect(within(views).getByRole("link", { name: /^Later \d+, something new$/ })).toBeInTheDocument();
  });

  it("filters with one row of pills, no Refine sheet, and one Clear", async () => {
    const { user, router } = setup("/ideas");
    const pills = await screen.findByRole("group", { name: "Filter ideas" });
    // Only categories with something in this view; no favorites yet, so no ♥ pill.
    expect(within(pills).getAllByRole("button").map((button) => button.textContent)).toEqual(["Synthetic Category", "Synthetic Second"]);
    expect(screen.queryByRole("button", { name: /Refine/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    await user.click(within(pills).getByRole("button", { name: "Synthetic Second" }));
    expect(await rowTitles()).toEqual(["Synthetic Theirs Waiting"]);
    expect(router.state.location.search).toBe(`?category=${CAT_2}`);
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await rowTitles()).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("offers ♥ Favorites once something is a favorite, a favorite of either of you", async () => {
    const db = seed();
    db.item_responses!.find((row) => row.item_id === id(2) && row.member_id === B)!.is_favorite = true;
    const { user } = setup("/ideas", PARTNER_A, db);
    const pills = await screen.findByRole("group", { name: "Filter ideas" });
    await user.click(within(pills).getByRole("button", { name: "♥ Favorites" }));
    expect(within(pills).getByRole("button", { name: "♥ Favorites" })).toHaveAttribute("aria-pressed", "true");
    expect(await rowTitles()).toHaveLength(1);
  });

  it("says when filters match nothing, and keeps the chosen pill so it can be cleared", async () => {
    setup(`/ideas?favorite=both`);
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Filter ideas" })).getByRole("button", { name: "♥ Favorites" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
  });

  it("when nothing is waiting, says so warmly, with counts that link where things went", async () => {
    const db: Partial<FakeDb> = { item_views: [], comments: [] };
    const both = { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "ready" } };
    seedItem(db, { id: id(1), title: "Synthetic Agreed One", creatorId: A, responses: both });
    seedItem(db, { id: id(2), title: "Synthetic Agreed Two", creatorId: B, responses: both });
    seedItem(db, { id: id(3), title: "Synthetic Parked", creatorId: A, responses: { [A]: { roulette_decision: "not_now" }, [B]: { roulette_decision: "not_now" } } });
    seedItem(db, { id: id(4), title: "Synthetic Draft", creatorId: A, status: "draft" });
    for (const n of [1, 2, 3]) {
      db.item_views!.push({ couple_id: SYNTHETIC_COUPLE_ID, item_id: id(n), member_id: A, first_seen_at: "2026-02-01T00:00:00Z", last_seen_at: "2026-02-01T00:00:00Z" });
    }
    renderApp(createFakeSupabase({ signedInAs: PARTNER_A, db }).client, { route: "/ideas" });
    expect(await screen.findByRole("heading", { name: "All caught up" })).toBeInTheDocument();
    const line = screen.getByText(/Nothing.s waiting on either of you\./);
    expect(line).toHaveTextContent("Nothing's waiting on either of you. Share something new or go plan.");
    expect(within(line).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Share something new", "/ideas/new"],
      ["go plan", "/plan"],
    ]);
    // The counts live on the views and tabs now, so the empty state doesn't repeat them.
    expect(screen.queryByRole("list", { name: "Where everything is" })).not.toBeInTheDocument();
    const views = screen.getByRole("navigation", { name: "Idea views" });
    expect(within(views).getAllByRole("link").map((link) => link.textContent)).toEqual(["Shared 0", "Later 1", "My drafts 1"]);
    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primary).getByRole("link", { name: /^Ideas/ })).toHaveTextContent(/^Ideas 2/);
    expect(within(primary).getByRole("link", { name: /^Plan/ })).toHaveTextContent(/^Plan 2/);
    expect(screen.queryByText(/Refine/)).not.toBeInTheDocument();
  });

  it("invites the first idea when there are none", async () => {
    setup("/ideas", PARTNER_A, {});
    expect(await screen.findByText("No ideas yet")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "New" })[0]).toHaveAttribute("href", "/ideas/new");
  });

  it("keeps old /palette and /experiences links working", async () => {
    const first = setup(`/palette/${id(1)}`);
    await waitFor(() => expect(first.router.state.location.pathname).toBe(`/ideas/${id(1)}`));
    first.unmount();
    const second = setup("/experiences?view=theirs");
    await waitFor(() => expect(second.router.state.location.pathname).toBe("/ideas"));
  });
});

describe("Plan tab", () => {
  it("offers Spin, then every agreed idea right there, newest activity first", async () => {
    const db = seed();
    // A second agreed idea, older, so the list order is visible.
    seedItem(db, { id: id(10), title: "Synthetic Ours Older", creatorId: A, responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "ready" } } });
    renderApp(createFakeSupabase({ signedInAs: PARTNER_A, db }).client, { route: "/plan" });
    expect(await screen.findByRole("button", { name: "Deal a card" })).toBeEnabled();
    const list = await screen.findByRole("list", { name: "Agreed ideas" });
    expect(within(list).getAllByRole("link").map((link) => link.querySelector(".idea-row-title")?.textContent ?? link.textContent)).toEqual([
      expect.stringContaining("Synthetic Ours Ready"),
      expect.stringContaining("Synthetic Ours Older"),
    ]);
    expect(screen.getByRole("heading", { level: 2, name: "2 ideas ready to plan" })).toBeInTheDocument();
    expect(screen.queryByText("Just agreed")).not.toBeInTheDocument();
    // Each row says what happened since you agreed.
    expect(within(list).getByRole("link", { name: /Synthetic Ours Older/ })).toHaveTextContent("Not picked yet");
    expect(screen.queryByRole("link", { name: /See all agreed/ })).not.toBeInTheDocument();
  });

  it("one pill row filters both the deck and the agreed list, with no Refine", async () => {
    const { user, router, rpc } = setup(`/plan?category=${CAT_2}`);
    expect(await screen.findByText("Nothing matches")).toBeInTheDocument();
    // The count follows the filter.
    expect(screen.getByRole("heading", { level: 2, name: "0 of 1 ready to plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refine/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByRole("link", { name: /Synthetic Ours Ready/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/plan");
    expect(router.state.location.search).toBe("");
    await user.click(within(screen.getByRole("group", { name: "Filter ideas" })).getByRole("button", { name: "Synthetic Category" }));
    expect(router.state.location.search).toBe(`?category=${CAT_1}`);
    await user.click(screen.getByRole("button", { name: "Deal a card" }));
    await screen.findByRole("heading", { level: 2, name: "Synthetic Ours Ready" });
    expect(rpc.mock.calls.filter(([name]) => name === "draw_roulette").map(([, args]) => args)).toEqual([
      { p_filter_category_id: CAT_1, p_favorites_only: false },
    ]);
  });

  it("lays out Plan as: reveal style top right, the deck, then the count, its filters and the list", async () => {
    setup("/plan");
    const style = await screen.findByRole("group", { name: "Reveal style" });
    const deck = await screen.findByRole("button", { name: "Deal a card" });
    const heading = screen.getByRole("heading", { level: 2, name: /ready to plan/ });
    const pills = screen.getByRole("group", { name: "Filter ideas" });
    const list = screen.getByRole("list", { name: "Agreed ideas" });
    const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect([before(style, deck), before(deck, heading), before(heading, pills), before(pills, list)]).toEqual([true, true, true, true]);
    // The filters explain themselves: no "Pick from" label, no "All agreed ideas" note.
    expect(screen.queryByText("Pick from")).not.toBeInTheDocument();
    expect(screen.queryByText("All agreed ideas")).not.toBeInTheDocument();
    // Everything on Plan is agreed, so rows don't repeat "Both in".
    expect(within(list).queryByText("Both in")).not.toBeInTheDocument();
  });

  it("shows the latest pick on a Plan row", async () => {
    const db = seed();
    db.roulette_draws = [
      {
        id: "00000000-0000-4000-8000-0000000d0001",
        couple_id: SYNTHETIC_COUPLE_ID,
        item_id: id(7),
        drawn_by_member_id: B,
        filter_category_id: null,
        outcome: "accepted",
        request_id: "00000000-0000-4000-8000-0000000d0002",
        created_at: "2026-02-01T12:00:00Z",
      },
    ];
    setup("/plan", PARTNER_A, db);
    const list = await screen.findByRole("list", { name: "Agreed ideas" });
    expect(within(list).getByRole("link", { name: /Synthetic Ours Ready/ })).toHaveTextContent("Synthetic Partner B picked it");
  });

  it("sends old /plan/agreed links to Plan, filters kept", async () => {
    const { router } = setup(`/plan/agreed?category=${CAT_2}`);
    await waitFor(() => expect(router.state.location.pathname).toBe("/plan"));
    expect(router.state.location.search).toBe(`?category=${CAT_2}`);
  });

  it("explains Plan when nothing is agreed yet", async () => {
    setup("/plan", PARTNER_A, {});
    expect(await screen.findByText(/Once you're both in on an idea/)).toBeInTheDocument();
  });
});
