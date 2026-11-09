import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PARTNER_A, PARTNER_B, SYNTHETIC_COUPLE_ID, createFakeSupabase, renderApp, seedItem, type FakeDb } from "../../test/testUtils";

const ITEM = "00000000-0000-4000-8000-000000000911";
const MEMORY = "00000000-0000-4000-8000-000000000912";
const A = PARTNER_A.member.id;
const B = PARTNER_B.member.id;

function setup() {
  const db: Partial<FakeDb> = {};
  seedItem(db, {
    id: ITEM,
    title: "Synthetic Remembered Idea",
    description: "Synthetic remembered description.",
    responses: { [A]: { roulette_decision: "ready" }, [B]: { roulette_decision: "ready" } },
  });
  db.memories = [
    {
      id: MEMORY,
      couple_id: SYNTHETIC_COUPLE_ID,
      item_id: ITEM,
      draw_id: null,
      author_member_id: B,
      body: "Synthetic remembered body",
      highlight: null,
      next_time: "repeat",
      refinement: null,
      request_id: MEMORY,
      created_at: "2026-01-12T12:00:00Z",
    },
  ];
  const fake = createFakeSupabase({ signedInAs: PARTNER_A, db });
  const view = renderApp(fake.client, { route: `/ideas/${ITEM}` });
  return { ...fake, ...view, user: userEvent.setup() };
}

describe("MemoryList", () => {
  it("shows who and when, and only the fields that were filled in", async () => {
    setup();
    const list = await screen.findByRole("list", { name: "Memories" });
    const memory = within(list).getByRole("listitem");
    expect(memory).toHaveTextContent("Synthetic Partner B");
    expect(memory).toHaveTextContent(/Jan 12/);
    expect(memory).toHaveTextContent("Synthetic remembered body");
    expect(memory).toHaveTextContent("Next time: Repeat");
    expect(memory).not.toHaveTextContent("Especially meaningful");
    expect(memory).not.toHaveTextContent("Refinement or variation");
  });

  it("Create a related idea opens the editor with both lineage links and saves nothing until asked", async () => {
    const { user, rpc, router } = setup();
    const list = await screen.findByRole("list", { name: "Memories" });
    await user.click(within(list).getByRole("button", { name: "Create a related idea" }));
    expect(await screen.findByRole("heading", { name: "A related idea" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/ideas/new");
    expect(JSON.stringify(router.state.location)).not.toContain("Synthetic");
    expect(screen.getByLabelText("Title")).toHaveValue("Synthetic Remembered Idea");
    expect(rpc.mock.calls.filter(([name]) => name === "create_item")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === "create_item")).toHaveLength(1));
    expect(rpc.mock.calls.find(([name]) => name === "create_item")![1]).toMatchObject({
      p_source_item_id: ITEM,
      p_source_memory_id: MEMORY,
    });
  });

  it("a plain Remix keeps only the item lineage", async () => {
    const { user, rpc } = setup();
    await user.click(await screen.findByRole("button", { name: /More actions|⋯/ }));
    await user.click(screen.getByRole("menuitem", { name: "Remix" }));
    expect(await screen.findByRole("heading", { name: "Remix an idea" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === "create_item")).toHaveLength(1));
    const args = rpc.mock.calls.find(([name]) => name === "create_item")![1] as Record<string, unknown>;
    expect(args.p_source_item_id).toBe(ITEM);
    expect(args).not.toHaveProperty("p_source_memory_id");
  });
});
