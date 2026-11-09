import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PARTNER_A, createFakeSupabase, renderApp } from "../test/testUtils";

describe("authenticated routes", () => {
  it.each([
    ["/", "Ideas"],
    ["/ideas", "Ideas"],
    ["/ideas/new", "Add an idea"],
    ["/ideas/00000000-0000-4000-8000-000000000001", "This idea isn't available"],
    ["/ideas/00000000-0000-4000-8000-000000000001/edit", "This idea isn't available"],
    ["/plan", "Plan"],
    ["/plan/agreed", "Plan"],
    ["/roulette", "Plan"],
  ])("renders %s inside the shell", async (route, heading) => {
    const { client } = createFakeSupabase({ signedInAs: PARTNER_A });
    renderApp(client, { route });

    expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
  });

  it("sends unknown paths to Ideas", async () => {
    const { client } = createFakeSupabase({ signedInAs: PARTNER_A });
    renderApp(client, { route: "/not-a-route" });

    expect(await screen.findByRole("heading", { level: 1, name: "Ideas" })).toBeInTheDocument();
  });

  it("moves between sections with the primary navigation", async () => {
    const user = userEvent.setup();
    const { client } = createFakeSupabase({ signedInAs: PARTNER_A });
    renderApp(client);

    await user.click(await screen.findByRole("link", { name: /^Plan\b/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Plan" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Plan\b/ })).toHaveAttribute("aria-current", "page");
  });

  it("keeps my name and Sign out in the account menu, not on every page", async () => {
    const user = userEvent.setup();
    const { client } = createFakeSupabase({ signedInAs: PARTNER_A });
    renderApp(client, { route: "/ideas" });
    const account = await screen.findByRole("button", { name: "Account" });
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
    await user.click(account);
    const menu = screen.getByRole("menu", { name: "Account" });
    expect(within(menu).getByText(PARTNER_A.member.display_name)).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("renders no private route while signed out, even from a deep link", async () => {
    const { client } = createFakeSupabase();
    renderApp(client, { route: "/ideas/00000000-0000-4000-8000-000000000001" });

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
