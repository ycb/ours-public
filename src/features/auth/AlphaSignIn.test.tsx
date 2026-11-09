import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PARTNER_A, createFakeSupabase, renderApp } from "../../test/testUtils";

const PASSWORD = "synthetic-password-a";

describe("closed alpha sign-in", () => {
  it("offers email and password only, with no signup or recovery control", async () => {
    const { client } = createFakeSupabase();
    renderApp(client);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();

    const controls = [...screen.queryAllByRole("link"), ...screen.queryAllByRole("button")];
    for (const control of controls) {
      expect(control).not.toHaveTextContent(/sign up|create account|register|forgot|reset|recover/i);
    }
  });

  it("submits credentials to signInWithPassword exactly once", async () => {
    const user = userEvent.setup();
    const { client, auth } = createFakeSupabase({
      accounts: [{ partner: PARTNER_A, password: PASSWORD }],
    });
    renderApp(client);

    await user.type(await screen.findByLabelText(/email/i), PARTNER_A.email);
    await user.type(screen.getByLabelText(/password/i), PASSWORD);
    const submit = screen.getByRole("button", { name: /sign in/i });
    await user.dblClick(submit);

    await screen.findByText(PARTNER_A.member.display_name);
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: PARTNER_A.email,
      password: PASSWORD,
    });
  });

  it("shows a neutral error on invalid credentials without echoing them", async () => {
    const user = userEvent.setup();
    const { client } = createFakeSupabase({
      accounts: [{ partner: PARTNER_A, password: PASSWORD }],
    });
    const { container } = renderApp(client);

    await user.type(await screen.findByLabelText(/email/i), PARTNER_A.email);
    await user.type(screen.getByLabelText(/password/i), "wrong-synthetic-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/didn.t work/i);
    expect(alert).not.toHaveTextContent(PARTNER_A.email);
    expect(container).not.toHaveTextContent("wrong-synthetic-password");
    expect(container).not.toHaveTextContent(/invalid login credentials/i);
    expect(screen.getByLabelText(/password/i)).toHaveValue("");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("aria-describedby", alert.id);
  });
});
