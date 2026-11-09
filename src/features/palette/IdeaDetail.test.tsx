import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PARTNER_A,
  PARTNER_B,
  SYNTHETIC_COUPLE_ID,
  createFakeSupabase,
  renderApp,
  seedItem,
  type FakeDb,
} from "../../test/testUtils";
import { ASKED_AGAIN_DELAY_MS } from "./InlineIdeaFields";

const ITEM = "00000000-0000-4000-8000-000000000001";
const A = PARTNER_A.member.id;
const B = PARTNER_B.member.id;
const CAT_1 = "00000000-0000-4000-8000-00000000c001";

type Responses = NonNullable<Parameters<typeof seedItem>[1]>["responses"];

function setup({
  as = PARTNER_A,
  route = `/ideas/${ITEM}`,
  status = "submitted" as "draft" | "submitted",
  creatorId = A,
  responses = {} as Responses,
  configure,
  timers = false,
}: {
  as?: typeof PARTNER_A;
  route?: string;
  status?: "draft" | "submitted";
  creatorId?: string;
  responses?: Responses;
  configure?: (db: Partial<FakeDb>) => void;
  timers?: boolean;
} = {}) {
  const db: Partial<FakeDb> = {};
  seedItem(db, { id: ITEM, status, creatorId, responses });
  configure?.(db);
  const fake = createFakeSupabase({ signedInAs: as, db });
  const user = timers ? userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) : userEvent.setup();
  return { ...fake, ...renderApp(fake.client, { route }), user };
}

const rpcCalls = (rpc: ReturnType<typeof createFakeSupabase>["rpc"], fn: string) =>
  rpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args as Record<string, unknown>);
const message = (id: string, author: string, body: string, created_at: string) => ({
  id,
  couple_id: SYNTHETIC_COUPLE_ID,
  item_id: ITEM,
  author_member_id: author,
  body,
  request_id: id,
  kind: "message",
  created_at,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("header", () => {
  it("shows the title, who shared it and the category in a sheet with Close", async () => {
    setup();
    const sheet = await screen.findByRole("dialog", { name: "Synthetic Item A" });
    expect(within(sheet).getByRole("heading", { level: 1, name: "Synthetic Item A" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByText("From you")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveDisplayValue("Synthetic Category");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Synthetic description A");
  });

  it("toggles my favorite from the heart next to the title", async () => {
    const { user, rpc } = setup();
    const heart = await screen.findByRole("button", { name: "Favorite" });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await user.click(heart);
    await waitFor(() => expect(heart).toHaveAttribute("aria-pressed", "true"));
    expect(rpcCalls(rpc, "set_item_favorite")).toEqual([{ p_item_id: ITEM, p_favorite: true }]);
    expect(rpcCalls(rpc, "set_roulette_decision")).toHaveLength(0);
  });

  it("keeps Remix and Delete in the overflow menu, and never offers Archive there", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Remix", "Delete…"]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("offers the partner Remix but not Delete", async () => {
    const { user } = setup({ as: PARTNER_B });
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    expect(within(screen.getByRole("menu")).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Remix"]);
  });

  it.each([
    ["a missing id", "/ideas/00000000-0000-4000-8000-00000000dead"],
    ["a malformed id", "/ideas/not-a-real-id"],
  ])("renders a neutral not-found state for %s", async (_label, route) => {
    setup({ route });
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByRole("heading", { name: /isn.t available/i })).toBeInTheDocument();
    expect(within(sheet).queryByText("Synthetic Item A")).not.toBeInTheDocument();
  });

  it("sends old edit links to the idea itself", async () => {
    const { router } = setup({ route: `/ideas/${ITEM}/edit` });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ideas/${ITEM}`));
    expect(await screen.findByRole("textbox", { name: "Title" })).toBeInTheDocument();
  });
});

describe("as a sheet over the list", () => {
  it("opens from a row over the list and closes back to it, focus on that row", async () => {
    const { user, router } = setup({ route: "/ideas" });
    const row = await screen.findByRole("link", { name: /Synthetic Item A/ });
    await user.click(row);
    const sheet = await screen.findByRole("dialog", { name: "Synthetic Item A" });
    expect(router.state.location.pathname).toBe(`/ideas/${ITEM}`);
    // The list stays mounted underneath, hidden from assistive tech while the sheet is open.
    expect(screen.queryByRole("navigation", { name: "Idea views" })).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ideas"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("link", { name: /Synthetic Item A/ })).toHaveFocus());
  });

  it("closes with Escape", async () => {
    const { user, router } = setup({ route: "/ideas" });
    await user.click(await screen.findByRole("link", { name: /Synthetic Item A/ }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/ideas"));
  });

  it("keeps the list's view while open, and returns to it", async () => {
    const { user, router } = setup({ route: "/ideas?view=drafts", status: "draft" });
    await user.click(await screen.findByRole("link", { name: /Synthetic Item A/ }));
    await screen.findByRole("dialog");
    expect(router.state.location.search).toBe("?view=drafts");
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ideas"));
    expect(router.state.location.search).toBe("?view=drafts");
  });

  it("closes to Ideas when opened from a direct link", async () => {
    const { user, router } = setup();
    await user.click(await screen.findByRole("button", { name: "Close" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ideas"));
    expect(await screen.findByRole("navigation", { name: "Idea views" })).toBeInTheDocument();
  });

  it("keeps keyboard focus inside the sheet", async () => {
    const { user } = setup();
    const sheet = await screen.findByRole("dialog");
    await waitFor(() => expect(within(sheet).getByRole("button", { name: "Close" })).toHaveFocus());
    for (let step = 0; step < 25; step += 1) {
      await user.tab();
      expect(sheet.contains(document.activeElement)).toBe(true);
    }
  });
});

describe("editing in place", () => {
  it("reveals line attribution without removing direct editing", async () => {
    const { user, db } = setup({
      configure: (db) => {
        db.items![0].description = "Synthetic description A\nSynthetic addition by B";
        db.item_revisions![0].description = "Synthetic description A";
        db.item_revisions!.push({
          id: "00000000-0000-4000-8000-00000000e003",
          couple_id: SYNTHETIC_COUPLE_ID,
          item_id: ITEM,
          revision_number: 2,
          editor_member_id: B,
          title: "Synthetic Item A",
          description: "Synthetic description A\nSynthetic addition by B",
          category_id: CAT_1,
          created_at: "2026-10-24T12:00:00Z",
        });
      },
    });

    await user.click(await screen.findByRole("button", { name: "Who wrote what" }));
    const attribution = screen.getByRole("region", { name: "Who wrote what" });
    expect(within(attribution).getByText("Written by Synthetic Partner B, Oct 24, 2026")).toBeVisible();
    expect(within(attribution).getByText("Synthetic addition by B")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Hide who wrote what" }));
    const description = screen.getByRole("textbox", { name: "Description" });
    await user.type(description, " updated");
    await user.tab();
    await waitFor(() => expect(db.items[0].description).toContain("updated"));
  });

  it("saves a changed title when I leave the field, recording a new version", async () => {
    const { user, db, rpc } = setup();
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Synthetic Item A revised");
    await user.tab();

    await waitFor(() => expect(db.items[0].title).toBe("Synthetic Item A revised"));
    expect(rpcCalls(rpc, "update_item")[0]).toMatchObject({ p_item_id: ITEM, p_expected_updated_at: "2026-01-10T12:00:00Z" });
    expect(db.item_revisions.filter((row) => row.item_id === ITEM)).toHaveLength(2);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("saves nothing when I leave a field unchanged", async () => {
    const { user, rpc } = setup();
    await user.click(await screen.findByRole("textbox", { name: "Description" }));
    await user.tab();
    expect(rpcCalls(rpc, "update_item")).toHaveLength(0);
  });

  it("lets an idea have no details yet, inviting them with a placeholder", async () => {
    const { user, rpc, db } = setup({ responses: { [A]: { roulette_decision: "ready" } } });
    const description = await screen.findByRole("textbox", { name: "Description" });
    await user.clear(description);
    await user.tab();
    await waitFor(() => expect(db.items[0].description).toBe(""));
    expect(rpcCalls(rpc, "update_item").at(-1)).toMatchObject({ p_description: "" });
    expect(screen.queryByText("Add a description.")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveAttribute("placeholder", "Add details…");
  });

  it("explains an empty title and doesn't save it", async () => {
    const { user, rpc } = setup();
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.tab();
    expect(await screen.findByText("Add a title.")).toBeInTheDocument();
    expect(rpcCalls(rpc, "update_item")).toHaveLength(0);
  });

  it("saves a category change right away", async () => {
    const { user, db } = setup({
      configure: (db) => {
        db.categories!.push({ ...db.categories![0], id: "00000000-0000-4000-8000-00000000c002", name: "Synthetic Second" });
      },
    });
    await user.selectOptions(await screen.findByRole("combobox", { name: "Category" }), "Synthetic Second");
    await waitFor(() => expect(db.items[0].category_id).toBe("00000000-0000-4000-8000-00000000c002"));
  });

  it("adds a new category from the category menu and files the idea under it", async () => {
    const { user, db } = setup();
    await user.selectOptions(await screen.findByRole("combobox", { name: "Category" }), "New category…");
    const name = screen.getByRole("textbox", { name: "Category name" });
    expect(name).toHaveFocus();
    await user.type(name, "Synthetic Fresh");
    await user.click(screen.getByRole("button", { name: "Add category" }));

    await waitFor(() => expect(db.categories.some((row) => row.name === "Synthetic Fresh")).toBe(true));
    const created = db.categories.find((row) => row.name === "Synthetic Fresh")!;
    await waitFor(() => expect(db.items[0].category_id).toBe(created.id));
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveDisplayValue("Synthetic Fresh");
    expect(screen.queryByRole("textbox", { name: "Category name" })).not.toBeInTheDocument();
  });

  it("explains a duplicate category name and cancels back to the current category", async () => {
    const { user, db } = setup();
    await user.selectOptions(await screen.findByRole("combobox", { name: "Category" }), "New category…");
    await user.type(screen.getByRole("textbox", { name: "Category name" }), "synthetic category");
    await user.click(screen.getByRole("button", { name: "Add category" }));
    expect(await screen.findByText(/already have a category with that name/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveDisplayValue("Synthetic Category");
    expect(db.categories).toHaveLength(1);
  });

  it("saves a title change right away when my partner is in, and keeps them in", async () => {
    const { user, rpc, db } = setup({ responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "ready" } } });
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.type(title, " renamed");
    await user.tab();
    expect(screen.queryByRole("status", { name: "Save pending" })).not.toBeInTheDocument();
    await waitFor(() => expect(db.items[0].title).toBe("Synthetic Item A renamed"));
    expect(rpcCalls(rpc, "update_item")).toHaveLength(1);
    expect(db.item_responses.find((row) => row.member_id === B)?.roulette_decision).toBe("ready");
  });

  it("holds a description change behind Undo when my partner is already in, and Undo writes nothing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, rpc, db } = setup({ responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "ready" } }, timers: true });
    const description = await screen.findByRole("textbox", { name: "Description" });
    const before = (description as HTMLTextAreaElement).value;
    await user.type(description, " again");
    await user.tab();

    const notice = await screen.findByRole("status", { name: "Save pending" });
    expect(notice).toHaveTextContent("Synthetic Partner B will be asked again");
    await user.click(within(notice).getByRole("button", { name: "Undo" }));
    expect(description).toHaveValue(before);
    act(() => {
      vi.advanceTimersByTime(ASKED_AGAIN_DELAY_MS + 100);
    });
    expect(rpcCalls(rpc, "update_item")).toHaveLength(0);
    expect(db.item_responses.find((row) => row.member_id === B)?.roulette_decision).toBe("ready");
  });

  it("saves a description change after the Undo window and asks my partner again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { user, rpc, db } = setup({ responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "ready" } }, timers: true });
    const description = await screen.findByRole("textbox", { name: "Description" });
    await user.type(description, " again");
    await user.tab();
    await screen.findByRole("status", { name: "Save pending" });
    expect(rpcCalls(rpc, "update_item")).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(ASKED_AGAIN_DELAY_MS + 100);
    });
    await waitFor(() => expect(db.items[0].description).toMatch(/ again$/));
    expect(db.item_responses.find((row) => row.member_id === B)?.roulette_decision).toBe("pending");
  });

  it("lets my partner co-edit in place, which asks me again", async () => {
    const { user, db } = setup({ as: PARTNER_B, responses: { [A]: { roulette_decision: "ready" } } });
    const description = await screen.findByRole("textbox", { name: "Description" });
    await user.clear(description);
    await user.type(description, "Synthetic description, adjusted by B");
    await user.tab();
    // A is in, so B's save waits behind Undo; flush it by leaving the page.
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(db.items[0].description).toBe("Synthetic description, adjusted by B"));
    expect(db.item_responses.find((row) => row.member_id === A)?.roulette_decision).toBe("pending");
  });

  it("never silently overwrites a newer version", async () => {
    const { user, db } = setup();
    const title = await screen.findByRole("textbox", { name: "Title" });
    // Partner B saves while A is typing.
    Object.assign(db.items[0], { title: "Synthetic B's newer title", updated_at: "2026-02-02T00:00:00Z" });
    await user.clear(title);
    await user.type(title, "Synthetic A's title");
    await user.tab();

    const conflict = await screen.findByRole("alert");
    expect(conflict).toHaveTextContent("Synthetic Partner B just changed this");
    expect(db.items[0].title).toBe("Synthetic B's newer title");
    await user.click(within(conflict).getByRole("button", { name: "See theirs" }));
    await waitFor(() => expect(title).toHaveValue("Synthetic B's newer title"));
  });

  it("can keep my version after a conflict", async () => {
    const { user, db } = setup();
    const title = await screen.findByRole("textbox", { name: "Title" });
    Object.assign(db.items[0], { title: "Synthetic B's newer title", updated_at: "2026-02-02T00:00:00Z" });
    await user.clear(title);
    await user.type(title, "Synthetic A's title");
    await user.tab();
    await user.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Keep mine" }));
    await waitFor(() => expect(db.items[0].title).toBe("Synthetic A's title"));
  });
});

const tiles = async () =>
  within(await answerArea()).getAllByRole("button").filter((button) => button.hasAttribute("aria-pressed")).map((button) => button.textContent);
const answerArea = () => screen.findByRole("group", { name: "Your answer" });
const heat = () => screen.findByRole("radiogroup", { name: "How into it?" });

describe("answers (variation 3, QA 2026-11-03)", () => {
  it("leads with one line about my partner, then my answer as three choices, then the optional heat rating", async () => {
    setup({ creatorId: B, responses: { [B]: { interest: "very_into_it", is_favorite: true, roulette_decision: "ready" } } });
    const status = await screen.findByRole("status", { name: "Where it stands" });
    expect(status).toHaveTextContent("Synthetic Partner B is in · very into it");
    expect(status).toHaveTextContent("favorite");
    expect(await tiles()).toEqual(["I'm in", "Maybe later", "Not for me"]);
    const rating = await heat();
    expect(within(rating).getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual(["Low", "Curious", "Into it", "Very into it"]);
    expect(within(rating).queryByRole("radio", { checked: true })).not.toBeInTheDocument();
    // The old side-by-side cards and their dropdown are gone.
    expect(screen.queryByRole("list", { name: "Answers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Your interest" })).not.toBeInTheDocument();
  });

  it("I'm in sends only the decision, then collapses to one row with Change", async () => {
    const { user, rpc } = setup({ creatorId: B, responses: { [B]: { roulette_decision: "ready" } } });
    await user.click(within(await answerArea()).getByRole("button", { name: "I'm in" }));
    await waitFor(() => expect(rpcCalls(rpc, "set_roulette_decision")).toEqual([{ p_item_id: ITEM, p_decision: "ready" }]));
    expect(rpcCalls(rpc, "set_item_interest")).toHaveLength(0);
    const area = await answerArea();
    await waitFor(() => expect(within(area).getByText("I'm in")).toBeInTheDocument());
    expect(within(area).queryByRole("button", { name: "Maybe later" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /You're both in/ })).toHaveAttribute("href", "/plan");
    await user.click(within(area).getByRole("button", { name: "Change" }));
    expect(await tiles()).toEqual(["I'm in", "Maybe later", "Not for me"]);
    expect(within(await answerArea()).getByRole("button", { name: "I'm in" })).toHaveAttribute("aria-pressed", "true");
  });

  it("starts the author In after sharing, collapsed, and lets them change their mind", async () => {
    const { user } = setup({ responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "pending", interest: "low" } } });
    expect(await screen.findByRole("status", { name: "Where it stands" })).toHaveTextContent("Synthetic Partner B hasn't answered · low");
    await user.click(within(await answerArea()).getByRole("button", { name: "Change" }));
    expect(await tiles()).toEqual(["I'm in", "Maybe later", "Not for me"]);
  });

  it("asks the author to agree again after the partner edits it", async () => {
    const { user, rpc } = setup({ responses: { [A]: { roulette_decision: "pending" }, [B]: { roulette_decision: "ready" } } });
    expect(await screen.findByText("Synthetic Partner B changed this. Say I'm in to agree to this version.")).toBeInTheDocument();
    await user.click(within(await answerArea()).getByRole("button", { name: "I'm in" }));
    await waitFor(() => expect(rpcCalls(rpc, "set_roulette_decision")).toEqual([{ p_item_id: ITEM, p_decision: "ready" }]));
  });

  it("does not claim success early and explains a failed save", async () => {
    const { user, failNext } = setup({ creatorId: B });
    failNext("set_roulette_decision", "error");
    await user.click(within(await answerArea()).getByRole("button", { name: "I'm in" }));
    expect(await within(await answerArea()).findByRole("alert")).toHaveTextContent(/not saved/i);
    expect(await tiles()).toEqual(["I'm in", "Maybe later", "Not for me"]);
  });

  it("rates on the heat bar without touching the decision, and tapping the same step clears it", async () => {
    const { user, rpc } = setup({ creatorId: B, responses: { [B]: { roulette_decision: "ready" } } });
    await user.click(within(await heat()).getByRole("radio", { name: "Into it" }));
    await waitFor(() => expect(rpcCalls(rpc, "set_item_interest")).toEqual([{ p_item_id: ITEM, p_interest: "into_it" }]));
    expect(rpcCalls(rpc, "set_roulette_decision")).toHaveLength(0);
    expect(await screen.findByText("Saved · Synthetic Partner B can see this")).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole("radiogroup", { name: "How into it?" })).getByRole("radio", { name: "Into it" })).toBeChecked());
    await user.click(within(await heat()).getByRole("radio", { name: "Into it" }));
    await waitFor(() => expect(rpcCalls(rpc, "set_item_interest").at(-1)).toEqual({ p_item_id: ITEM, p_interest: null }));
  });

  it("keeps Low interest as a real step", async () => {
    const { user, rpc } = setup({ creatorId: B, responses: { [B]: { roulette_decision: "ready" } } });
    await user.click(within(await heat()).getByRole("radio", { name: "Low" }));
    await waitFor(() => expect(rpcCalls(rpc, "set_item_interest")).toEqual([{ p_item_id: ITEM, p_interest: "low" }]));
  });
});

describe("Maybe later", () => {
  it("suggests Later with an optional note, posted into the chat, while my partner is still in", async () => {
    const { user, rpc, db } = setup({ as: PARTNER_B });
    await user.click(within(await answerArea()).getByRole("button", { name: "Maybe later" }));
    const dialog = await screen.findByRole("dialog", { name: "Come back to this later?" });
    expect(within(dialog).getByText(/It moves to Later once you both choose it/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Anything you.d want to talk about first\?/), "Synthetic note from B");
    await user.click(within(dialog).getByRole("button", { name: "Suggest Later" }));
    await waitFor(() => expect(db.item_responses.find((row) => row.member_id === B)?.roulette_decision).toBe("not_now"));
    expect(rpcCalls(rpc, "decline_item")[0]).toMatchObject({ p_item_id: ITEM, p_reason: "Synthetic note from B" });
    const thread = await screen.findByRole("list", { name: "Messages" });
    const note = within(thread).getByText("Synthetic note from B").closest("li")!;
    expect(within(note).getByText("· Later", { exact: false })).toHaveTextContent(/^· Later$/);
    expect(within(await answerArea()).getByText("Maybe later")).toBeInTheDocument();
    expect(screen.getByText("Waiting for Synthetic Partner A. It moves to Later once you both choose it.")).toBeInTheDocument();
  });

  it("needs no note, and then posts nothing; cancelling changes nothing", async () => {
    const { user, rpc, db } = setup({ as: PARTNER_B });
    await user.click(within(await answerArea()).getByRole("button", { name: "Maybe later" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Come back to this later?" })).getByRole("button", { name: "Cancel" }));
    expect(rpcCalls(rpc, "decline_item")).toHaveLength(0);
    await user.click(within(await answerArea()).getByRole("button", { name: "Maybe later" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Come back to this later?" })).getByRole("button", { name: "Suggest Later" }));
    await waitFor(() => expect(db.item_responses.find((row) => row.member_id === B)?.roulette_decision).toBe("not_now"));
    expect(db.comments ?? []).toHaveLength(0);
  });

  it("shows the author their partner's suggestion with the choices open, and Maybe later from them moves it", async () => {
    const { user, db } = setup({ responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "not_now" } } });
    expect(await screen.findByRole("status", { name: "Where it stands" })).toHaveTextContent("Synthetic Partner B suggests Later");
    expect(await tiles()).toEqual(["I'm in", "Maybe later", "Not for me"]);
    await user.click(within(await answerArea()).getByRole("button", { name: "Maybe later" }));
    const dialog = await screen.findByRole("dialog", { name: "Come back to this later?" });
    expect(within(dialog).getByText(/You both want to wait/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Move to Later" }));
    await waitFor(() => expect(db.item_responses.find((row) => row.member_id === A)?.roulette_decision).toBe("not_now"));
  });
});

describe("Not for me", () => {
  it("archives the idea for both, with an optional note posted into the chat", async () => {
    const { user, rpc, db } = setup({ as: PARTNER_B });
    await user.click(within(await answerArea()).getByRole("button", { name: "Not for me" }));
    const dialog = await screen.findByRole("dialog", { name: "Not for me?" });
    expect(within(dialog).getByText(/archives it for both of you/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Anything you want to say\?/), "Synthetic pass note");
    await user.click(within(dialog).getByRole("button", { name: "Not for me" }));
    await waitFor(() => expect(db.items[0].archived_at).not.toBeNull());
    expect(rpcCalls(rpc, "pass_item")[0]).toMatchObject({ p_item_id: ITEM, p_note: "Synthetic pass note" });
    expect(await screen.findByText(/This idea is archived/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Messages" })).getByText("Synthetic pass note")).toBeInTheDocument();
  });

  it("works for the author too, needs no note, and cancelling changes nothing", async () => {
    const { user, rpc, db } = setup({ responses: { [A]: { roulette_decision: "ready" } } });
    await user.click(within(await answerArea()).getByRole("button", { name: "Change" }));
    await user.click(within(await answerArea()).getByRole("button", { name: "Not for me" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Not for me?" })).getByRole("button", { name: "Cancel" }));
    expect(rpcCalls(rpc, "pass_item")).toHaveLength(0);
    await user.click(within(await answerArea()).getByRole("button", { name: "Not for me" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Not for me?" })).getByRole("button", { name: "Not for me" }));
    await waitFor(() => expect(db.items[0].archived_at).not.toBeNull());
    expect(db.comments ?? []).toHaveLength(0);
  });
});

describe("chat", () => {
  it("shows messages in order, with no heading or filler", async () => {
    setup({
      configure: (db) => {
        db.comments = [
          message("00000000-0000-4000-8000-0000000c0002", B, "Synthetic second", "2026-01-12T12:00:00Z"),
          message("00000000-0000-4000-8000-0000000c0001", A, "Synthetic first", "2026-01-11T12:00:00Z"),
        ];
      },
    });
    const thread = await screen.findByRole("list", { name: "Messages" });
    const bodies = within(thread).getAllByRole("listitem").map((item) => item.textContent);
    expect(bodies[0]).toContain("Synthetic first");
    expect(bodies[1]).toContain("Synthetic second");
    expect(bodies[1]).toContain("Synthetic Partner B");
    expect(screen.queryByText(/comments and questions/i)).not.toBeInTheDocument();
  });

  it("sends a message and clears the composer", async () => {
    const { user, db } = setup();
    const composer = await screen.findByRole("textbox", { name: "Message to Synthetic Partner B" });
    expect(composer).toHaveAttribute("placeholder", "Write to Synthetic Partner B…");
    await user.type(composer, "Synthetic question?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(db.comments).toHaveLength(1));
    expect(await within(screen.getByRole("list", { name: "Messages" })).findByText("Synthetic question?")).toBeInTheDocument();
    expect(composer).toHaveValue("");
  });

  it("keeps a failed message in the composer", async () => {
    const { user, failNext, db } = setup();
    failNext("add_comment", "error");
    const composer = await screen.findByRole("textbox", { name: "Message to Synthetic Partner B" });
    await user.type(composer, "Synthetic retry me");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/not sent/i)).toBeInTheDocument();
    expect(composer).toHaveValue("Synthetic retry me");
    expect(db.comments).toHaveLength(0);
  });

  it("reuses the request id after an ambiguous failure and creates one message and event", async () => {
    const { user, failNext, db, rpc } = setup();
    failNext("add_comment", "ambiguous");
    const composer = await screen.findByRole("textbox", { name: "Message to Synthetic Partner B" });
    await user.type(composer, "Synthetic once");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/not sent/i);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(composer).toHaveValue(""));
    const ids = rpcCalls(rpc, "add_comment").map((args) => args.p_request_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(db.comments).toHaveLength(1);
    expect(db.activity_events.filter((event) => event.event_type === "comment_added")).toHaveLength(1);
  });
});

describe("only what's useful", () => {
  it("hides edit history with a single version, and shows it once there are two", async () => {
    setup();
    await screen.findByRole("textbox", { name: "Title" });
    expect(screen.queryByRole("button", { name: /edit history/i })).not.toBeInTheDocument();
  });

  it("collapses a longer history and shows who and when before content", async () => {
    const { user } = setup({
      configure: (db) => {
        db.item_revisions!.push({
          id: "00000000-0000-4000-8000-00000000e002",
          couple_id: SYNTHETIC_COUPLE_ID,
          item_id: ITEM,
          revision_number: 2,
          editor_member_id: A,
          title: "Synthetic Item A",
          description: "Synthetic older wording",
          category_id: CAT_1,
          created_at: "2026-01-15T12:00:00Z",
        });
      },
    });
    const toggle = await screen.findByRole("button", { name: "Edit history (2 versions)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: /version 2 · you · jan 15, 2026/i }));
    expect(screen.getByText("Synthetic older wording")).toBeInTheDocument();
  });

  it("hides Memories until the idea is agreed", async () => {
    setup();
    await screen.findByRole("textbox", { name: "Title" });
    expect(screen.queryByRole("heading", { name: "Memories" })).not.toBeInTheDocument();
  });

  it("shows Memories once both are in", async () => {
    setup({ responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "ready" } } });
    expect(await screen.findByRole("heading", { name: "Memories" })).toBeInTheDocument();
  });

  it("marks an idea seen when it is opened", async () => {
    const { rpc, db } = setup({ as: PARTNER_B });
    await screen.findByRole("textbox", { name: "Title" });
    await waitFor(() => expect(rpcCalls(rpc, "mark_item_seen")).toEqual([{ p_item_id: ITEM }]));
    expect(db.item_views.filter((row) => row.member_id === B)).toHaveLength(1);
  });
});

describe("drafts", () => {
  it("says once that only I can see it, next to Share, and hides answers and chat", async () => {
    setup({ status: "draft" });
    expect(await screen.findByText("Only you can see this until you share it.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Your answer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /message to/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Favorite" })).not.toBeInTheDocument();
  });

  it("is editable in place and shares from the page", async () => {
    const { user, db } = setup({ status: "draft" });
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.type(title, " draft");
    await user.tab();
    await waitFor(() => expect(db.items[0].title).toBe("Synthetic Item A draft"));
    await user.click(screen.getByRole("button", { name: "Share with Synthetic Partner B" }));
    await waitFor(() => expect(db.items[0].status).toBe("submitted"));
    expect(await screen.findByRole("group", { name: "Your answer" })).toBeInTheDocument();
  });
});

describe("delete and archive", () => {
  it("asks first, then deletes permanently", async () => {
    const { user, db, router } = setup();
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete…" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete this idea?" });
    expect(within(dialog).getByText(/can't be undone/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ideas"));
    expect(db.items).toHaveLength(0);
  });

  it("offers Archive only when something depends on the idea", async () => {
    const { user, db, router } = setup({
      configure: (db) => {
        seedItem(db, { id: "00000000-0000-4000-8000-000000000002", title: "Synthetic Child", sourceItemId: ITEM, creatorId: B });
      },
    });
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete…" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete this idea?" });
    expect(within(dialog).queryByRole("button", { name: "Archive instead" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));
    expect(await within(dialog).findByText(/archive it instead/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Archive instead" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ideas"));
    expect(db.items.find((row) => row.id === ITEM)?.archived_at).not.toBeNull();
  });
});

describe("remix", () => {
  it("starts a new idea from this one, with lineage", async () => {
    const { user, db, router } = setup({ as: PARTNER_B });
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Remix" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ideas/new"));
    const title = await screen.findByLabelText(/^title/i);
    await waitFor(() => expect(title).toHaveValue("Synthetic Item A"));
    await user.type(title, " (remix)");
    await user.click(screen.getByRole("button", { name: /share with synthetic partner a/i }));
    await waitFor(() => expect(db.items).toHaveLength(2));
    expect(db.items[1]).toMatchObject({ source_item_id: ITEM, creator_member_id: B, title: "Synthetic Item A (remix)" });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ideas/${db.items[1].id}`));
    expect(await screen.findByText(/remixed from/i)).toBeInTheDocument();
  });
});
