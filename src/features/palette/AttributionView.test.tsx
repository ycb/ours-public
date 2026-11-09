import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AttributionRevision } from "../../domain/attribution";
import { AttributionView } from "./AttributionView";

const A = "00000000-0000-4000-8000-0000000000a0";
const B = "00000000-0000-4000-8000-0000000000b0";

const revisions: AttributionRevision[] = [
  {
    revision_number: 1,
    editor_member_id: A,
    title: "Synthetic title",
    description: "First synthetic line\nSecond synthetic line",
    created_at: "2026-10-21T12:00:00Z",
  },
  {
    revision_number: 2,
    editor_member_id: B,
    title: "Synthetic title",
    description: "First synthetic line\nPartner synthetic line\nSecond synthetic line",
    created_at: "2026-10-24T12:00:00Z",
  },
];

const renderView = () =>
  render(
    <AttributionView
      revisions={revisions}
      currentMemberId={A}
      partners={[
        { id: A, display_name: "Synthetic Partner A", sort_order: 0 },
        { id: B, display_name: "Synthetic Partner B", sort_order: 1 },
      ]}
    >
      <textarea aria-label="Description" defaultValue={revisions[1].description} />
    </AttributionView>,
  );

describe("AttributionView", () => {
  it("keeps attribution hidden by default and reveals author text with the toggle", async () => {
    const user = userEvent.setup();
    renderView();

    expect(screen.getByRole("textbox", { name: "Description" })).toBeVisible();
    expect(screen.queryByText(/written by/i)).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Who wrote what" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const attribution = screen.getByRole("region", { name: "Who wrote what" });
    expect(within(attribution).getAllByText("Written by you, Oct 21, 2026")).toHaveLength(2);
    expect(within(attribution).getByText("Written by Synthetic Partner B, Oct 24, 2026")).toBeVisible();
    expect(within(attribution).getByText("Partner synthetic line")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Description" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide who wrote what" }));
    expect(screen.getByRole("textbox", { name: "Description" })).toBeVisible();
  });

  it("reveals on a deliberate left swipe without making swipe the only control", () => {
    renderView();
    const description = screen.getByRole("textbox", { name: "Description" });

    fireEvent.pointerDown(description, { pointerId: 1, pointerType: "touch", clientX: 180, clientY: 40 });
    fireEvent.pointerUp(description, { pointerId: 1, pointerType: "touch", clientX: 90, clientY: 48 });

    expect(screen.getByRole("region", { name: "Who wrote what" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Hide who wrote what" })).toBeVisible();
  });

  it("does not reveal for vertical movement or a short horizontal gesture", () => {
    renderView();
    const description = screen.getByRole("textbox", { name: "Description" });

    fireEvent.pointerDown(description, { pointerId: 2, pointerType: "touch", clientX: 180, clientY: 40 });
    fireEvent.pointerUp(description, { pointerId: 2, pointerType: "touch", clientX: 160, clientY: 120 });

    expect(screen.queryByRole("region", { name: "Who wrote what" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Who wrote what" })).toBeVisible();
  });

  it("keeps separate timestamps when the same person adds an adjacent line later", async () => {
    const user = userEvent.setup();
    render(
      <AttributionView
        revisions={[
          {
            revision_number: 1,
            editor_member_id: A,
            title: "Synthetic title",
            description: "Older synthetic line",
            created_at: "2026-10-21T12:00:00Z",
          },
          {
            revision_number: 2,
            editor_member_id: A,
            title: "Synthetic title",
            description: "Older synthetic line\nNewer synthetic line",
            created_at: "2026-10-24T12:00:00Z",
          },
        ]}
        currentMemberId={A}
        partners={[{ id: A, display_name: "Synthetic Partner A", sort_order: 0 }]}
      >
        <textarea aria-label="Description" defaultValue="Older synthetic line\nNewer synthetic line" />
      </AttributionView>,
    );

    await user.click(screen.getByRole("button", { name: "Who wrote what" }));

    const attribution = screen.getByRole("region", { name: "Who wrote what" });
    expect(within(attribution).getByText("Written by you, Oct 21, 2026")).toBeVisible();
    expect(within(attribution).getByText("Written by you, Oct 24, 2026")).toBeVisible();
  });
});
