import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";
import { createFakeSupabase } from "./test/testUtils";

describe("Ours app", () => {
  it("opens on the closed sign-in screen when signed out", async () => {
    const { client } = createFakeSupabase();
    render(<App client={client} />);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
