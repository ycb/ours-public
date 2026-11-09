import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { activityKeys, paletteKeys } from "../palette/keys";
import { PARTNER_A, PARTNER_B, createFakeSupabase, renderApp, seedItem, type FakeDb } from "../../test/testUtils";

const ITEM = "00000000-0000-4000-8000-000000000901";
const A = PARTNER_A.member.id;
const B = PARTNER_B.member.id;

function setup() {
  const db: Partial<FakeDb> = {};
  seedItem(db, {
    id: ITEM,
    title: "Synthetic Agreed Memory Idea",
    responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "ready" } },
  });
  const fake = createFakeSupabase({ signedInAs: PARTNER_B, db });
  const view = renderApp(fake.client, { route: `/ideas/${ITEM}` });
  const memoryCalls = () => fake.rpc.mock.calls.filter(([name]) => name === "add_memory").map(([, args]) => args as Record<string, unknown>);
  return { ...fake, ...view, memoryCalls, user: userEvent.setup() };
}

async function openComposer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add a memory" }));
  return screen.getByRole("form", { name: "Add a memory" });
}

describe("MemoryComposer", () => {
  it("asks two questions (QA 2026-11-03), and either answer is enough", async () => {
    const { user, memoryCalls } = setup();
    const form = await openComposer(user);
    expect(within(form).getByLabelText("What did you enjoy?")).toBeInTheDocument();
    expect(within(form).getByLabelText("Anything to change or improve for next time?")).toBeInTheDocument();
    expect(within(form).queryByLabelText(/especially meaningful/)).not.toBeInTheDocument();
    expect(within(form).queryByRole("combobox")).not.toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: "Save memory" }));
    expect(within(form).getByText("Write what you enjoyed, or what to change.")).toBeInTheDocument();
    expect(memoryCalls()).toHaveLength(0);
  });

  it("saves a body-only memory with the optional fields empty, trimmed, and server-attributed", async () => {
    const { user, memoryCalls, db } = setup();
    const form = await openComposer(user);
    await user.type(within(form).getByLabelText("What did you enjoy?"), "  Synthetic memory body  ");
    await user.click(within(form).getByRole("button", { name: "Save memory" }));
    await waitFor(() => expect(db.memories).toHaveLength(1));
    expect(memoryCalls()[0]).toEqual({
      p_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      p_item_id: ITEM,
      p_draw_id: null,
      p_body: "Synthetic memory body",
      p_highlight: null,
      p_next_time: null,
      p_refinement: null,
    });
    expect(Object.keys(memoryCalls()[0])).not.toContain("p_author_member_id");
    expect(db.memories[0].author_member_id).toBe(B);
  });

  it("saves both answers and shows them on the idea as Enjoyed and Next time", async () => {
    const { user, memoryCalls } = setup();
    const form = await openComposer(user);
    await user.type(within(form).getByLabelText("What did you enjoy?"), "Synthetic full body");
    await user.type(within(form).getByLabelText("Anything to change or improve for next time?"), "Synthetic variation");
    await user.click(within(form).getByRole("button", { name: "Save memory" }));
    const list = await screen.findByRole("list", { name: "Memories" });
    expect(within(list).getByText("Synthetic full body").closest("p")).toHaveTextContent("Enjoyed: Synthetic full body");
    expect(within(list).getByText("Synthetic variation").closest("p")).toHaveTextContent("Next time: Synthetic variation");
    expect(memoryCalls()[0]).toMatchObject({ p_highlight: null, p_next_time: null, p_refinement: "Synthetic variation" });
    expect(screen.queryByRole("form", { name: "Add a memory" })).not.toBeInTheDocument();
  });

  it("refuses an over-long body before saving", async () => {
    const { user, memoryCalls } = setup();
    const form = await openComposer(user);
    const body = within(form).getByLabelText("What did you enjoy?");
    await user.click(body);
    await user.paste("x".repeat(4001));
    await user.click(within(form).getByRole("button", { name: "Save memory" }));
    expect(within(form).getByText("Keep it to 4000 characters or fewer.")).toBeInTheDocument();
    expect(memoryCalls()).toHaveLength(0);
  });

  it("keeps the draft after a failed save and retries an ambiguous one with the same request", async () => {
    const { user, memoryCalls, failNext, db } = setup();
    const form = await openComposer(user);
    await user.type(within(form).getByLabelText("What did you enjoy?"), "Synthetic retried body");
    await user.type(within(form).getByLabelText("Anything to change or improve for next time?"), "Synthetic retried change");
    failNext("add_memory", "ambiguous");
    await user.click(within(form).getByRole("button", { name: "Save memory" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Your memory is still here");
    expect(within(form).getByLabelText("What did you enjoy?")).toHaveValue("Synthetic retried body");
    expect(within(form).getByLabelText("Anything to change or improve for next time?")).toHaveValue("Synthetic retried change");
    await user.click(within(form).getByRole("button", { name: "Save memory" }));
    await screen.findByRole("list", { name: "Memories" });
    const [first, second] = memoryCalls();
    expect(second.p_request_id).toBe(first.p_request_id);
    expect(db.memories).toHaveLength(1);
    expect(db.activity_events.filter((row) => row.event_type === "memory_added")).toHaveLength(1);
  });

  it("refreshes the idea, its memories and activity after saving", async () => {
    const { user, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const form = await openComposer(user);
    await user.type(within(form).getByLabelText("What did you enjoy?"), "Synthetic refresh body");
    await user.click(within(form).getByRole("button", { name: "Save memory" }));
    await screen.findByRole("list", { name: "Memories" });
    const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
    for (const key of [paletteKeys.memories(ITEM), paletteKeys.item(ITEM), activityKeys.all]) {
      expect(keys).toContain(JSON.stringify(key));
    }
  });

  it("Cancel closes the composer without saving", async () => {
    const { user, memoryCalls } = setup();
    const form = await openComposer(user);
    await user.type(within(form).getByLabelText("What did you enjoy?"), "Synthetic abandoned body");
    await user.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Add a memory" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add a memory" })).toHaveFocus());
    expect(memoryCalls()).toHaveLength(0);
  });
});
