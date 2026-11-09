import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTNER_A, PARTNER_B, SYNTHETIC_COUPLE_ID, createFakeSupabase, renderApp, seedItem, type FakeDb } from "../../test/testUtils";

const A = PARTNER_A.member.id;
const B = PARTNER_B.member.id;
const ITEM = "00000000-0000-4000-8000-000000000a01";
const TITLE = "Synthetic Date Idea";
const DRAW = "00000000-0000-4000-8000-0000000d0a01";

function agreed(db: Partial<FakeDb> = {}) {
  seedItem(db, { id: ITEM, title: TITLE, creatorId: A, responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "ready" } } });
  return db;
}
function withDate(db: Partial<FakeDb>, overrides: Record<string, unknown>) {
  db.roulette_draws = [
    {
      id: DRAW,
      couple_id: SYNTHETIC_COUPLE_ID,
      item_id: ITEM,
      drawn_by_member_id: A,
      filter_category_id: null,
      outcome: "accepted",
      request_id: DRAW,
      created_at: "2026-11-01T10:00:00Z",
      source: "deck",
      planned_when: null,
      reflect_after: null,
      done_at: null,
      cancelled_at: null,
      ...overrides,
    },
  ];
  return db;
}
function setup(route: string, db: Partial<FakeDb>, as = PARTNER_A) {
  const fake = createFakeSupabase({ signedInAs: as, db });
  return { ...fake, ...renderApp(fake.client, { route }), user: userEvent.setup() };
}
const calls = (rpc: ReturnType<typeof createFakeSupabase>["rpc"], name: string) =>
  rpc.mock.calls.filter(([called]) => called === name).map(([, args]) => args as Record<string, unknown>);
const FUTURE = "2999-01-01T09:00:00Z";
const PAST = "2026-01-01T09:00:00Z";

beforeEach(() => vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true })));
afterEach(() => vi.unstubAllGlobals());

describe("a pick becomes a date", () => {
  it("after Let's do it, asks When? and saves it, with when to ask how it was", async () => {
    const { user, rpc, db } = setup("/plan", agreed());
    await user.click(await screen.findByRole("button", { name: "Deal a card" }));
    await user.click(await screen.findByRole("button", { name: "Let's do it" }));
    const when = await screen.findByRole("group", { name: "When?" });
    await user.click(within(when).getByRole("button", { name: "This weekend" }));
    await waitFor(() => expect(calls(rpc, "set_draw_when")).toHaveLength(1));
    expect(calls(rpc, "set_draw_when")[0]).toMatchObject({ p_draw_id: db.roulette_draws[0].id, p_when: "weekend" });
    expect(typeof calls(rpc, "set_draw_when")[0].p_reflect_after).toBe("string");
    await waitFor(() => expect(within(when).getByRole("button", { name: "This weekend" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("shows Up next on Plan, and We did it closes it", async () => {
    const { user, rpc } = setup("/plan", withDate(agreed(), { planned_when: "tonight", reflect_after: FUTURE }));
    const strip = await screen.findByRole("button", { name: new RegExp(`Up next: ${TITLE}, Tonight`) });
    await user.click(strip);
    const sheet = await screen.findByRole("dialog", { name: TITLE });
    expect(within(sheet).getByRole("group", { name: "Change when" })).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "Open the idea" })).toHaveAttribute("href", `/ideas/${ITEM}`);
    await user.click(within(sheet).getByRole("button", { name: "We did it" }));
    await waitFor(() => expect(calls(rpc, "mark_draw_done")).toEqual([{ p_draw_id: DRAW }]));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Up next:/ })).not.toBeInTheDocument());
  });

  it("Not anymore calls it off, with no penalty", async () => {
    const { user, rpc } = setup("/plan", withDate(agreed(), { planned_when: "weekend", reflect_after: FUTURE }));
    await user.click(await screen.findByRole("button", { name: /Up next:/ }));
    await user.click(within(await screen.findByRole("dialog", { name: TITLE })).getByRole("button", { name: "Not anymore" }));
    await waitFor(() => expect(calls(rpc, "cancel_draw")).toEqual([{ p_draw_id: DRAW }]));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Up next:/ })).not.toBeInTheDocument());
  });

  it("Plan this chooses an agreed idea directly, without the deck", async () => {
    const { user, rpc } = setup(`/ideas/${ITEM}`, agreed());
    await user.click(await screen.findByRole("button", { name: "Plan this" }));
    await user.click(within(await screen.findByRole("group", { name: "When?" })).getByRole("button", { name: "Tonight" }));
    await waitFor(() => expect(calls(rpc, "plan_item")).toHaveLength(1));
    expect(calls(rpc, "plan_item")[0]).toMatchObject({ p_item_id: ITEM, p_when: "tonight" });
    expect(await screen.findByText("Up next · Tonight")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plan this" })).not.toBeInTheDocument();
  });
});

describe("reflecting", () => {
  const due = () => {
    const db = withDate(agreed(), { planned_when: "tonight", reflect_after: PAST });
    db.memories = [
      {
        id: "00000000-0000-4000-8000-0000000e0a01",
        couple_id: SYNTHETIC_COUPLE_ID,
        item_id: ITEM,
        draw_id: DRAW,
        author_member_id: B,
        body: "Synthetic enjoyed",
        highlight: null,
        next_time: null,
        refinement: "Synthetic slower next time",
        request_id: "00000000-0000-4000-8000-0000000e0a02",
        created_at: "2026-01-02T09:00:00Z",
      },
    ];
    return db;
  };

  it("puts a dot on my avatar and the date in its menu, never a banner on the page", async () => {
    const { user } = setup("/ideas", due());
    const account = await screen.findByRole("button", { name: "Account, 1 to reflect on" });
    expect(screen.queryByText(`How was ${TITLE}?`)).not.toBeInTheDocument();
    await user.click(account);
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByRole("menuitem", { name: new RegExp(`How was ${TITLE}\\?`) })).toHaveTextContent("Synthetic Partner B reflected");
  });

  it("opens the reflection with my partner's answers, and shares mine as a memory of that date", async () => {
    const { user, rpc } = setup("/ideas", due());
    await user.click(await screen.findByRole("button", { name: "Account, 1 to reflect on" }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(`How was ${TITLE}\\?`) }));
    const sheet = await screen.findByRole("dialog", { name: `How was ${TITLE}?` });
    expect(within(sheet).getByText("Synthetic enjoyed")).toBeInTheDocument();
    expect(within(sheet).getByText("Synthetic slower next time")).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText("What did you enjoy?"), "Synthetic mine");
    await user.click(within(sheet).getByRole("button", { name: "Share with Synthetic Partner B" }));
    await waitFor(() => expect(calls(rpc, "add_memory")).toHaveLength(1));
    expect(calls(rpc, "add_memory")[0]).toMatchObject({ p_item_id: ITEM, p_draw_id: DRAW, p_body: "Synthetic mine", p_refinement: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument());
  });

  it("needs one answer, either one", async () => {
    const { user, rpc } = setup("/ideas", due());
    await user.click(await screen.findByRole("button", { name: "Account, 1 to reflect on" }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(`How was ${TITLE}\\?`) }));
    const sheet = await screen.findByRole("dialog", { name: `How was ${TITLE}?` });
    await user.click(within(sheet).getByRole("button", { name: "Share with Synthetic Partner B" }));
    expect(await within(sheet).findByText("Write what you enjoyed, or what to change.")).toBeInTheDocument();
    expect(calls(rpc, "add_memory")).toHaveLength(0);
    await user.type(within(sheet).getByLabelText("Anything to change or improve for next time?"), "Synthetic only change");
    await user.click(within(sheet).getByRole("button", { name: "Share with Synthetic Partner B" }));
    await waitFor(() => expect(calls(rpc, "add_memory")[0]).toMatchObject({ p_body: "", p_refinement: "Synthetic only change" }));
  });

  it("offers Reschedule, Make a variation and the rating, right there", async () => {
    const { user, rpc, router } = setup("/ideas", due());
    await user.click(await screen.findByRole("button", { name: "Account, 1 to reflect on" }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(`How was ${TITLE}\\?`) }));
    const sheet = await screen.findByRole("dialog", { name: `How was ${TITLE}?` });
    expect(within(sheet).getByRole("radiogroup", { name: "How into it now?" })).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Reschedule" }));
    await user.click(within(within(sheet).getByRole("group", { name: "When?" })).getByRole("button", { name: "This weekend" }));
    await waitFor(() => expect(calls(rpc, "plan_item")[0]).toMatchObject({ p_item_id: ITEM, p_when: "weekend" }));
    await user.click(within(sheet).getByRole("button", { name: "Make a variation" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ideas/new"));
  });

  it("also asks on the idea's own page", async () => {
    const { user } = setup(`/ideas/${ITEM}`, due());
    await user.click(await screen.findByRole("button", { name: "How was it? Add yours" }));
    expect(await screen.findByRole("dialog", { name: `How was ${TITLE}?` })).toBeInTheDocument();
  });
});
