import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  PARTNER_A,
  createFakeSupabase,
  renderApp,
  seedItem,
  syntheticCategory,
  type FakeDb,
} from "../../test/testUtils";

const CAT = "00000000-0000-4000-8000-00000000c001";

function setup(options: { categories?: ReturnType<typeof syntheticCategory>[]; db?: Partial<FakeDb> } = {}) {
  const fake = createFakeSupabase({
    signedInAs: PARTNER_A,
    db: { categories: options.categories ?? [syntheticCategory(CAT, "Synthetic Category")], ...options.db },
  });
  const view = renderApp(fake.client, { route: "/ideas/new" });
  return { ...fake, ...view, user: userEvent.setup() };
}

async function fillValidDraft(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/^title/i), "Synthetic Item A");
  await user.type(screen.getByLabelText(/^description/i), "Synthetic description A");
  await user.selectOptions(screen.getByLabelText(/^category/i), "Synthetic Category");
}

describe("item editor", () => {
  it("asks how into it you are and saves that with the share", async () => {
    const { user, db, rpc } = setup();
    await fillValidDraft(user);
    // The same heat bar as everywhere else (QA 2026-11-03), not a dropdown.
    const rating = screen.getByRole("radiogroup", { name: "How into it are you?" });
    expect(within(rating).getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual(["Low", "Curious", "Into it", "Very into it"]);
    expect(screen.queryByRole("combobox", { name: /How into it/ })).not.toBeInTheDocument();
    await user.click(within(rating).getByRole("radio", { name: "Very into it" }));
    await user.click(screen.getByRole("button", { name: /share with synthetic partner b/i }));
    await waitFor(() => expect(db.items[0]?.status).toBe("submitted"));
    const mine = db.item_responses.find((row) => row.member_id === PARTNER_A.member.id);
    expect(mine?.interest).toBe("very_into_it");
    const order = rpc.mock.calls.map(([name]) => name).filter((name) => ["create_item", "set_item_interest", "submit_item"].includes(name));
    expect(order).toEqual(["create_item", "set_item_interest", "submit_item"]);
  });

  it("keeps the rating with a private draft", async () => {
    const { user, db, rpc } = setup();
    await fillValidDraft(user);
    await user.click(within(screen.getByRole("radiogroup", { name: "How into it are you?" })).getByRole("radio", { name: "Curious" }));
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(db.items).toHaveLength(1));
    expect(db.items[0].status).toBe("draft");
    expect(db.item_responses.find((row) => row.member_id === PARTNER_A.member.id)?.interest).toBe("curious");
    expect(rpc).not.toHaveBeenCalledWith("submit_item", expect.anything());
  });

  it("sends no rating when none is chosen", async () => {
    const { user, db, rpc } = setup();
    await fillValidDraft(user);
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(db.items).toHaveLength(1));
    expect(rpc).not.toHaveBeenCalledWith("set_item_interest", expect.anything());
  });

  it("shares with just a title and a category: the description is optional", async () => {
    const { user, rpc, db } = setup();
    await user.type(await screen.findByLabelText(/^title/i), "Synthetic quick idea");
    expect(screen.getByLabelText(/^description/i)).toHaveAccessibleName(/optional/i);
    await user.selectOptions(screen.getByLabelText(/^category/i), "Synthetic Category");
    await user.click(screen.getByRole("button", { name: /share with synthetic partner b/i }));
    await waitFor(() => expect(db.items[0]?.status).toBe("submitted"));
    expect(rpc).toHaveBeenCalledWith("create_item", expect.objectContaining({ p_title: "Synthetic quick idea", p_description: "" }));
  });

  it("starts in the category I used last", async () => {
    const CAT_2 = "00000000-0000-4000-8000-00000000c002";
    const db: Partial<FakeDb> = { categories: [syntheticCategory(CAT, "Synthetic Category"), syntheticCategory(CAT_2, "Synthetic Second", 1)] };
    seedItem(db, { id: "00000000-0000-4000-8000-000000000901", categoryId: CAT, creatorId: PARTNER_A.member.id });
    seedItem(db, { id: "00000000-0000-4000-8000-000000000902", categoryId: CAT_2, creatorId: PARTNER_A.member.id });
    db.items!.find((row) => String(row.id).endsWith("902"))!.created_at = "2026-02-01T00:00:00Z";
    setup({ db, categories: db.categories as ReturnType<typeof syntheticCategory>[] });
    await waitFor(() => expect(screen.getByLabelText(/^category/i)).toHaveDisplayValue("Synthetic Second"));
  });

  it("requires a title and one category", async () => {
    const { user, rpc } = setup();
    await user.click(await screen.findByRole("button", { name: /share with synthetic partner b/i }));

    expect(screen.getByLabelText(/^title/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^description/i)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText(/^category/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^title/i)).toHaveFocus();
    expect(rpc).not.toHaveBeenCalledWith("create_item", expect.anything());
  });

  it("creates a category inline and selects it", async () => {
    const { user, db } = setup({ categories: [] });

    await user.click(await screen.findByRole("button", { name: /new category/i }));
    await user.type(screen.getByLabelText(/category name/i), "Synthetic Fresh Category");
    await user.click(screen.getByRole("button", { name: /add category/i }));

    const select = screen.getByLabelText(/^category/i) as HTMLSelectElement;
    await waitFor(() =>
      expect(within(select).getByRole("option", { name: "Synthetic Fresh Category" })).toBeInTheDocument(),
    );
    expect(select.selectedOptions[0]).toHaveTextContent("Synthetic Fresh Category");
    expect(db.categories).toHaveLength(1);
  });

  it("explains a duplicate category name without creating one", async () => {
    const { user, db } = setup();

    await user.click(await screen.findByRole("button", { name: /new category/i }));
    await user.type(screen.getByLabelText(/category name/i), "synthetic category");
    await user.click(screen.getByRole("button", { name: /add category/i }));

    expect(await screen.findByText(/already have a category with that name/i)).toBeInTheDocument();
    expect(db.categories).toHaveLength(1);
  });

  it("saves a private draft without sharing it", async () => {
    const { user, db, router, rpc } = setup();
    await fillValidDraft(user);
    await user.click(screen.getByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(db.items).toHaveLength(1));
    expect(db.items[0].status).toBe("draft");
    expect(rpc).not.toHaveBeenCalledWith("submit_item", expect.anything());
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ideas/${db.items[0].id}`));
  });

  it("shares with the partner, invalidates queries, and opens the new idea", async () => {
    const { user, db, router, queryClient } = setup();
    await fillValidDraft(user);
    // Seed after sign-in settles: establishing the identity clears the cache by design.
    queryClient.setQueryData(["activity", "feed"], []);
    await user.click(screen.getByRole("button", { name: /share with synthetic partner b/i }));

    await waitFor(() => expect(db.items).toHaveLength(1));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ideas/${db.items[0].id}`));
    expect(router.state.location.search).toBe("");
    expect(queryClient.getQueryState(["activity", "feed"])?.isInvalidated).toBe(true);
    expect(db.item_responses).toHaveLength(2);
    expect(db.items[0].status).toBe("submitted");
    expect(db.item_responses.find((row) => row.member_id === PARTNER_A.member.id)?.roulette_decision).toBe("ready");
  });

  it("keeps a created draft when sharing fails, and shares it on retry without duplicating", async () => {
    const { user, db, failNext, router } = setup();
    failNext("submit_item", "error");
    await fillValidDraft(user);
    await user.click(screen.getByRole("button", { name: /share with synthetic partner b/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/saved as a draft, but not shared yet/i);
    expect(db.items).toHaveLength(1);
    expect(db.items[0].status).toBe("draft");

    await user.clear(screen.getByLabelText(/^title/i));
    await user.type(screen.getByLabelText(/^title/i), "Synthetic Item A edited");
    await user.click(screen.getByRole("button", { name: /share with synthetic partner b/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ideas/${db.items[0].id}`));
    expect(db.items).toHaveLength(1);
    expect(db.items[0].status).toBe("submitted");
    expect(db.items[0].title).toBe("Synthetic Item A edited");
  });

  it("keeps the draft and offers a retry when saving fails", async () => {
    const { user, failNext, db } = setup();
    failNext("create_item", "error");
    await fillValidDraft(user);
    await user.click(screen.getByRole("button", { name: /share with synthetic partner b/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not saved/i);
    expect(screen.getByLabelText(/^title/i)).toHaveValue("Synthetic Item A");
    expect(screen.getByLabelText(/^description/i)).toHaveValue("Synthetic description A");
    expect(screen.getByRole("alert")).not.toHaveTextContent(/synthetic item a/i);
    expect(db.items).toHaveLength(0);
  });

  it("reuses the request id after an ambiguous failure and ends with one item", async () => {
    const { user, failNext, db, rpc, router } = setup();
    failNext("create_item", "ambiguous");
    await fillValidDraft(user);
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    await screen.findByRole("alert");
    expect(db.items).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ideas/${db.items[0].id}`));

    const requestIds = rpc.mock.calls
      .filter(([fn]) => fn === "create_item")
      .map(([, args]) => (args as { p_request_id: string }).p_request_id);
    expect(requestIds).toHaveLength(2);
    expect(requestIds[0]).toBe(requestIds[1]);
    expect(db.items).toHaveLength(1);
  });

  it("asks before leaving with unsaved changes", async () => {
    const { user, router } = setup();
    await user.type(await screen.findByLabelText(/^title/i), "Synthetic draft");

    await user.click(screen.getByRole("link", { name: /^Plan\b/ }));
    const dialog = await screen.findByRole("alertdialog", { name: /discard/i });
    await user.click(within(dialog).getByRole("button", { name: /keep editing/i }));
    expect(router.state.location.pathname).toBe("/ideas/new");
    expect(screen.getByLabelText(/^title/i)).toHaveValue("Synthetic draft");

    await user.click(screen.getByRole("link", { name: /^Plan\b/ }));
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /discard/i }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe("/plan"));
  });

  it("leaves without asking when nothing was typed", async () => {
    const { user, router } = setup();
    await screen.findByLabelText(/^title/i);
    await user.click(screen.getByRole("link", { name: /^Plan\b/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/plan"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
