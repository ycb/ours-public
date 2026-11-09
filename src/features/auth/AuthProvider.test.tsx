import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  PARTNER_A,
  PARTNER_B,
  createFakeSupabase,
  renderApp,
} from "../../test/testUtils";

describe("authenticated member boundary", () => {
  it("fails closed when the signed-in user has no member mapping", async () => {
    const { client } = createFakeSupabase({ signedInAs: PARTNER_A, members: {} });
    renderApp(client, { route: "/ideas" });

    expect(await screen.findByRole("heading", { name: /isn.t set up/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText(PARTNER_A.member.display_name)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("fails closed when get_current_member returns another user's row", async () => {
    const { client } = createFakeSupabase({
      signedInAs: PARTNER_A,
      members: { [PARTNER_A.userId]: PARTNER_B.member },
    });
    renderApp(client);

    expect(await screen.findByRole("heading", { name: /isn.t set up/i })).toBeInTheDocument();
    expect(screen.queryByText(PARTNER_B.member.display_name)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("fails closed when get_current_member returns an all-null composite", async () => {
    const empty = Object.fromEntries(Object.keys(PARTNER_A.member).map((key) => [key, null]));
    const { client } = createFakeSupabase({
      signedInAs: PARTNER_A,
      members: { [PARTNER_A.userId]: empty },
    });
    renderApp(client);

    expect(await screen.findByRole("heading", { name: /isn.t set up/i })).toBeInTheDocument();
  });

  it("resolves only the caller's member row and renders the shell", async () => {
    const { client, rpc } = createFakeSupabase({ signedInAs: PARTNER_A });
    renderApp(client);

    const nav = await screen.findByRole("navigation", { name: /primary/i });
    expect(within(nav).getByRole("link", { name: /^Ideas/ })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /^Plan\b/ })).toBeInTheDocument();
    expect(screen.getByText(PARTNER_A.member.display_name)).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("get_current_member");
    expect(document.title).toBe("Ours");
  });

  it("clears the query cache and private UI before the sign-in screen appears", async () => {
    const user = userEvent.setup();
    const { client, auth } = createFakeSupabase({ signedInAs: PARTNER_A });
    const { queryClient } = renderApp(client, { route: "/ideas" });

    await screen.findByText(PARTNER_A.member.display_name);
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    let cacheSizeWhenSignInAppeared = -1;
    let privateUiWhenSignInAppeared = true;
    const observer = new MutationObserver(() => {
      if (cacheSizeWhenSignInAppeared === -1 && screen.queryByLabelText(/password/i)) {
        cacheSizeWhenSignInAppeared = queryClient.getQueryCache().getAll().length;
        privateUiWhenSignInAppeared =
          screen.queryByText(PARTNER_A.member.display_name) !== null ||
          screen.queryByRole("navigation") !== null;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
    await screen.findByLabelText(/password/i);
    observer.disconnect();

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(cacheSizeWhenSignInAppeared).toBe(0);
    expect(privateUiWhenSignInAppeared).toBe(false);
  });

  it("never shows Partner A's cached state after Partner B signs in", async () => {
    const user = userEvent.setup();
    const { client, rpc } = createFakeSupabase({
      signedInAs: PARTNER_A,
      accounts: [{ partner: PARTNER_B, password: "synthetic-password-b" }],
    });
    const { queryClient } = renderApp(client, { route: "/ideas" });

    await screen.findByText(PARTNER_A.member.display_name);
    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));

    await user.type(await screen.findByLabelText(/email/i), PARTNER_B.email);
    await user.type(screen.getByLabelText(/password/i), "synthetic-password-b");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await screen.findByText(PARTNER_B.member.display_name);
    expect(screen.queryByText(PARTNER_A.member.display_name)).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(2);
    const cachedKeys = queryClient.getQueryCache().getAll().map((query) => query.queryKey);
    expect(JSON.stringify(cachedKeys)).not.toContain(PARTNER_A.userId);
  });

  it("clears cached state if the session switches identity without an explicit sign-out", async () => {
    const { client, auth } = createFakeSupabase({ signedInAs: PARTNER_A });
    const { queryClient } = renderApp(client);
    await screen.findByText(PARTNER_A.member.display_name);

    const listener = auth.onAuthStateChange.mock.calls[0][0];
    listener("SIGNED_IN", {
      access_token: "synthetic-token-b",
      user: { id: PARTNER_B.userId, email: PARTNER_B.email },
    });

    await waitFor(() =>
      expect(screen.queryByText(PARTNER_A.member.display_name)).not.toBeInTheDocument(),
    );
    const cachedKeys = queryClient.getQueryCache().getAll().map((query) => query.queryKey);
    expect(JSON.stringify(cachedKeys)).not.toContain(PARTNER_A.userId);
  });
});
