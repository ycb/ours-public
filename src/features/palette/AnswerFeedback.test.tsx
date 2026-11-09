import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PARTNER_A, PARTNER_B, createFakeSupabase, renderApp, seedItem, type FakeDb } from "../../test/testUtils";

const ITEM = "00000000-0000-4000-8000-000000000931";
const A = PARTNER_A.member.id;
const B = PARTNER_B.member.id;

function setup({ as = PARTNER_B, status = "submitted" as "draft" | "submitted" } = {}) {
  const db: Partial<FakeDb> = {};
  seedItem(db, { id: ITEM, status, creatorId: A, responses: { [A]: { roulette_decision: status === "draft" ? "pending" : "ready" } } });
  const fake = createFakeSupabase({ signedInAs: as, db });
  return { ...fake, ...renderApp(fake.client, { route: `/ideas/${ITEM}` }), user: userEvent.setup() };
}

describe("answering without a message", () => {
  it("confirms a rating the moment it is saved, and that the partner can see it", async () => {
    const { user, db } = setup();
    await user.click(within(await screen.findByRole("radiogroup", { name: "How into it?" })).getByRole("radio", { name: "Into it" }));
    expect(await screen.findByText(`Saved · ${PARTNER_A.member.display_name} can see this`)).toBeInTheDocument();
    expect(db.item_responses.find((row) => row.member_id === B)?.interest).toBe("into_it");
  });

  it("only offers Send once there is a message, and never scolds an empty box", async () => {
    const { user } = setup();
    const chat = await screen.findByRole("region", { name: "Chat" });
    const send = within(chat).getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await user.type(within(chat).getByLabelText(`Message to ${PARTNER_A.member.display_name}`), "   ");
    expect(send).toBeDisabled();
    await user.type(within(chat).getByLabelText(`Message to ${PARTNER_A.member.display_name}`), "Synthetic hello");
    expect(send).toBeEnabled();
    expect(within(chat).queryByText("Write something first.")).not.toBeInTheDocument();
  });

  it("lets the author rate their own draft before sharing", async () => {
    const { user, db } = setup({ as: PARTNER_A, status: "draft" });
    await user.click(within(await screen.findByRole("radiogroup", { name: "How into it?" })).getByRole("radio", { name: "Very into it" }));
    await waitFor(() => expect(db.item_responses.find((row) => row.member_id === A)?.interest).toBe("very_into_it"));
    // Private until shared: no "can see this".
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.queryByText(/Saved · .* can see this/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Favorite" })).not.toBeInTheDocument();
  });
});
