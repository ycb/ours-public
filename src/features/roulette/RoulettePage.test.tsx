import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTNER_A, PARTNER_B, createFakeSupabase, renderApp, seedItem, syntheticCategory } from "../../test/testUtils";
import { HOLD_MS } from "./RoulettePage";

const A = PARTNER_A.member.id;
const B = PARTNER_B.member.id;
const CAT = "00000000-0000-4000-8000-00000000c801";
const OTHER_CAT = "00000000-0000-4000-8000-00000000c802";
const TITLE = "Synthetic Agreed Choice";

function setup(route = "/plan", prep?: (db: ReturnType<typeof createFakeSupabase>["db"]) => void) {
  const fake = createFakeSupabase({ signedInAs: PARTNER_A });
  fake.db.categories.push(syntheticCategory(CAT, "Synthetic One"), syntheticCategory(OTHER_CAT, "Synthetic Empty", 1));
  seedItem(fake.db, {
    id: "00000000-0000-4000-8000-000000000801",
    title: TITLE,
    description: "Synthetic agreed description.",
    categoryId: CAT,
    creatorId: A,
    responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "ready" } },
  });
  prep?.(fake.db);
  return { ...fake, ...renderApp(fake.client, { route }), user: userEvent.setup() };
}

const calls = (rpc: ReturnType<typeof createFakeSupabase>["rpc"], name: string) =>
  rpc.mock.calls.filter(([called]) => called === name).map(([, args]) => args);
const reduceMotion = (reduce: boolean) => vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: reduce }));
const deck = () => screen.findByRole("button", { name: "Deal a card" });
const pills = () => screen.findByRole("group", { name: "Filter ideas" });
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(within(await pills()).getByRole("button", { name }));
const pressed = () =>
  within(screen.getByRole("group", { name: "Filter ideas" }))
    .queryAllByRole("button", { pressed: true })
    .map((button) => button.textContent);
const result = () => screen.findByRole("heading", { level: 2, name: TITLE });

describe("Plan reveal", () => {
  // Most tests skip the deal animation; the motion tests turn it back on.
  beforeEach(() => {
    reduceMotion(true);
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });
  afterEach(() => vi.unstubAllGlobals());

  it("deals a card from all agreed ideas, with one primary action and a quiet way to pick again", async () => {
    const { user, rpc } = setup();
    await user.click(await deck());
    expect(await result()).toBeInTheDocument();
    expect(screen.getByText("Synthetic agreed description.")).toBeInTheDocument();
    expect(screen.getByText("This saves the pick for you both. Either of you can still change course.")).toBeInTheDocument();
    expect(calls(rpc, "draw_roulette")).toEqual([{ p_filter_category_id: null, p_favorites_only: false }]);
    const section = screen.getByRole("heading", { level: 2, name: TITLE }).closest("section")!;
    expect(within(section).getAllByRole("button").map((button) => button.textContent)).toEqual(["Let's do it", "Deal another"]);
    expect(within(section).getByRole("button", { name: "Let's do it" })).toHaveClass("button-primary");
    expect(within(section).getByRole("button", { name: "Deal another" })).toHaveClass("link-button");
    expect(screen.queryByRole("button", { name: /Leave for later|Accept|Spin again/ })).not.toBeInTheDocument();
  });

  it("shows a pill for each category with something agreed, one at a time, with a single way to clear it", async () => {
    const { user, rpc } = setup(`/plan?category=${OTHER_CAT}`);
    const group = await pills();
    // A chosen category stays (so it can be cleared) even with nothing agreed in it.
    // Clear trails the pills, inside the row, only while something is chosen.
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["Synthetic One", "Synthetic Empty", "Clear"]);
    expect(pressed()).toEqual(["Synthetic Empty"]);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    // Tapping the chosen pill again, or Clear, goes back to everything agreed; the empty one goes.
    await pick(user, "Synthetic Empty");
    expect(pressed()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["Synthetic One"]);
    await pick(user, "Synthetic One");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(pressed()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    await user.click(await deck());
    await result();
    expect(calls(rpc, "draw_roulette")).toEqual([{ p_filter_category_id: null, p_favorites_only: false }]);
    // The pills stay with the result, so the choice is always in view.
    expect(within(await pills()).getAllByRole("button")).toHaveLength(1);
  });

  it("deals only favorites with ♥ Favorites on", async () => {
    const { user, rpc } = setup("/plan", (db) => {
      db.item_responses.find((row) => row.member_id === B)!.is_favorite = true;
    });
    await pick(user, "♥ Favorites");
    expect(pressed()).toEqual(["♥ Favorites"]);
    await user.click(await deck());
    await result();
    expect(calls(rpc, "draw_roulette")).toEqual([{ p_filter_category_id: null, p_favorites_only: true }]);
  });

  it("says on the deck what it deals from, so the filters below stay connected to it", async () => {
    const { user } = setup("/plan");
    expect(screen.queryByText(/· from/)).not.toBeInTheDocument();
    await pick(user, "Synthetic One");
    expect(await screen.findByText("Tap the deck to deal · from Synthetic One")).toBeInTheDocument();
  });

  it("keeps an empty category empty without broadening", async () => {
    const { user, rpc } = setup(`/plan?category=${OTHER_CAT}`);
    await user.click(await deck());
    expect(await screen.findByText(/No agreed ideas in Synthetic Empty/)).toBeInTheDocument();
    expect(calls(rpc, "draw_roulette")).toEqual([{ p_filter_category_id: OTHER_CAT, p_favorites_only: false }]);
  });

  it("picks within a selected category and focuses the result", async () => {
    const { user, rpc } = setup();
    await pick(user, "Synthetic One");
    await user.click(await deck());
    const heading = await result();
    await waitFor(() => expect(heading).toHaveFocus());
    expect(calls(rpc, "draw_roulette")).toEqual([{ p_filter_category_id: CAT, p_favorites_only: false }]);
  });

  it("Deal another goes back to the deck, so every pick is dealt, and records nothing", async () => {
    const { user, rpc } = setup();
    await user.click(await deck());
    await user.click(await screen.findByRole("button", { name: "Deal another" }));
    expect(screen.queryByRole("heading", { level: 2, name: TITLE })).not.toBeInTheDocument();
    await waitFor(async () => expect(await deck()).toHaveFocus());
    expect(calls(rpc, "draw_roulette")).toHaveLength(1);
    await user.click(await deck());
    await result();
    expect(calls(rpc, "draw_roulette")).toHaveLength(2);
    expect(calls(rpc, "record_roulette_outcome")).toHaveLength(0);
  });

  it("Let's do it saves once, disables the choices while saving, and never defers", async () => {
    const { user, rpc, deferNextRpc } = setup();
    await user.click(await deck());
    const gate = deferNextRpc("record_roulette_outcome");
    await user.click(await screen.findByRole("button", { name: "Let's do it" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deal another" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Saving…" }));
    gate.release();
    expect(await screen.findByText("It's a date.")).toBeInTheDocument();
    expect(calls(rpc, "record_roulette_outcome")).toEqual([expect.objectContaining({ p_outcome: "accepted" })]);
    expect(await result()).toBeInTheDocument();
  });

  it("clears a stale result, says why, and moves focus back to the deck", async () => {
    const { user, failNext } = setup();
    await user.click(await deck());
    failNext("record_roulette_outcome", "stale" as never);
    await user.click(await screen.findByRole("button", { name: "Let's do it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/availability changed/i);
    expect(screen.queryByRole("heading", { level: 2, name: TITLE })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Deal a card" })).toHaveFocus());
  });

  it("keeps the pick after an unclear failure, retries with the same request, and won't swap it meanwhile", async () => {
    const { user, rpc, failNext } = setup();
    await user.click(await deck());
    failNext("record_roulette_outcome", "ambiguous");
    await user.click(await screen.findByRole("button", { name: "Let's do it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't be saved/i);
    expect(screen.getByRole("heading", { level: 2, name: TITLE })).toBeInTheDocument();
    // It may have saved: replacing the pick now could lose it.
    expect(screen.getByRole("button", { name: "Deal another" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Let's do it" }));
    expect(await screen.findByText("It's a date.")).toBeInTheDocument();
    const attempts = calls(rpc, "record_roulette_outcome") as Array<{ p_request_id: string }>;
    expect(attempts[1].p_request_id).toBe(attempts[0].p_request_id);
  });

  it("moves focus to Deal another after saving, which deals afresh from the deck", async () => {
    const { user, rpc } = setup();
    await user.click(await deck());
    await user.click(await screen.findByRole("button", { name: "Let's do it" }));
    expect(await screen.findByText("It's a date.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Deal another" })).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Deal another" }));
    expect(screen.queryByText("It's a date.")).not.toBeInTheDocument();
    await waitFor(async () => expect(await deck()).toHaveFocus());
    expect(calls(rpc, "draw_roulette")).toHaveLength(1);
    expect(calls(rpc, "record_roulette_outcome")).toHaveLength(1);
  });

  it("clears an unsaved pick when the category changes, recording nothing", async () => {
    const { user, rpc } = setup();
    await user.click(await deck());
    await result();
    await pick(user, "Synthetic One");
    expect(screen.queryByRole("heading", { level: 2, name: TITLE })).not.toBeInTheDocument();
    expect(calls(rpc, "record_roulette_outcome")).toHaveLength(0);
  });

  it("asks When? after the pick, not for a memory: that comes after the date (QA 2026-11-03)", async () => {
    const { user } = setup();
    await user.click(await deck());
    await user.click(await screen.findByRole("button", { name: "Let's do it" }));
    expect(await screen.findByRole("group", { name: "When?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a memory" })).not.toBeInTheDocument();
  });

  it("recovers when the selected category was archived meanwhile", async () => {
    const { user, rpc, db } = setup(`/plan?category=${OTHER_CAT}`);
    await pills();
    db.categories.find((row) => row.id === OTHER_CAT)!.archived_at = "2026-02-02T00:00:00Z";
    await user.click(await deck());
    expect(await screen.findByRole("alert")).toHaveTextContent("That category isn't available anymore");
    expect(pressed()).toEqual([]);
    await waitFor(() => expect(within(screen.getByRole("group", { name: "Filter ideas" })).queryByRole("button", { name: "Synthetic Empty" })).not.toBeInTheDocument());
    await user.click(await deck());
    expect(await result()).toBeInTheDocument();
    expect(calls(rpc, "draw_roulette").at(-1)).toEqual({ p_filter_category_id: null, p_favorites_only: false });
  });

  it("explains an empty pool and links back to Ideas, in an always-present status region", async () => {
    const { user } = setup(`/plan?category=${OTHER_CAT}`);
    await deck();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    await user.click(await deck());
    await waitFor(() => expect(status).toHaveTextContent(/No agreed ideas in Synthetic Empty\. An idea can come up once you're both in on it\./));
    expect(within(status).getByRole("link", { name: "Go to Ideas" })).toHaveAttribute("href", "/ideas");
  });

  it("keeps an unsaved pick through a failed background refresh", async () => {
    const { user, failNext, queryClient } = setup();
    await user.click(await deck());
    await result();
    failNext("from:items", "error", "error");
    await act(async () => {
      await queryClient.refetchQueries();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByText("Plan couldn't load")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Let's do it" })).toBeEnabled();
  });

  it("keeps a saved pick when the partner changes their answer right after", async () => {
    const { user, db, queryClient } = setup();
    await user.click(await deck());
    await user.click(await screen.findByRole("button", { name: "Let's do it" }));
    expect(await screen.findByText("It's a date.")).toBeInTheDocument();
    db.item_responses.find((row) => row.member_id === B)!.roulette_decision = "pending";
    await act(async () => {
      await queryClient.refetchQueries();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(screen.getByText("Nothing agreed yet")).toBeInTheDocument());
    expect(screen.getByText("It's a date.")).toBeInTheDocument();
  });
});

describe("reveal styles", () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });
  afterEach(() => vi.unstubAllGlobals());

  it("switches to a sealed note, and remembers the choice on this device", async () => {
    reduceMotion(true);
    const first = setup();
    const styles = await screen.findByRole("group", { name: "Reveal style" });
    expect(within(styles).getByRole("button", { name: "Card" })).toHaveAttribute("aria-pressed", "true");
    await first.user.click(within(styles).getByRole("button", { name: "Sealed note" }));
    expect(screen.getByRole("button", { name: "Open a sealed note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deal a card" })).not.toBeInTheDocument();
    first.unmount();
    setup();
    expect(await screen.findByRole("button", { name: "Open a sealed note" })).toBeInTheDocument();
  });

  it("opens the note after holding the seal, not on a quick press", async () => {
    reduceMotion(false);
    const { user, rpc } = setup();
    await user.click(within(await screen.findByRole("group", { name: "Reveal style" })).getByRole("button", { name: "Sealed note" }));
    const seal = screen.getByRole("button", { name: "Open a sealed note" });
    fireEvent.pointerDown(seal, { button: 0 });
    fireEvent.pointerUp(seal);
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS + 100));
    expect(calls(rpc, "draw_roulette")).toHaveLength(0);
    fireEvent.pointerDown(seal, { button: 0 });
    expect(seal).toHaveClass("is-holding");
    expect(await screen.findByRole("heading", { level: 2, name: TITLE }, { timeout: HOLD_MS + 2000 })).toBeInTheDocument();
    expect(screen.getByText("Tonight, how about…")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Draw another" }));
    // Back to a sealed note: each pick is opened, never swapped in.
    expect(await screen.findByRole("button", { name: "Open a sealed note" })).not.toHaveClass("is-holding");
    expect(calls(rpc, "draw_roulette")).toHaveLength(1);
  });

  it("opens the note from the keyboard without holding", async () => {
    reduceMotion(false);
    const { user } = setup();
    await user.click(within(await screen.findByRole("group", { name: "Reveal style" })).getByRole("button", { name: "Sealed note" }));
    // A click with no pointer (detail 0) is how Enter, Space and switch access arrive.
    fireEvent.click(screen.getByRole("button", { name: "Open a sealed note" }));
    expect(await result()).toBeInTheDocument();
  });

  it("animates only the card's copy, never the controls, and not at all with reduced motion", async () => {
    reduceMotion(true);
    const reduced = setup();
    await reduced.user.click(await deck());
    expect((await result()).parentElement).not.toHaveClass("roulette-result-motion");
    reduced.unmount();

    reduceMotion(false);
    const standard = setup();
    await standard.user.click(await deck());
    expect(screen.getByRole("button", { name: "Deal a card" })).toHaveClass("is-dealing");
    expect((await result()).parentElement).toHaveClass("roulette-result-motion");
    const animated = document.querySelector(".roulette-result-motion")!;
    expect(animated.querySelectorAll("button")).toHaveLength(0);
  });
});
