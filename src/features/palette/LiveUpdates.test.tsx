import { QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../lib/queryClient";
import {
  PARTNER_A,
  PARTNER_B,
  SYNTHETIC_COUPLE_ID,
  createFakeSupabase,
  renderApp,
  seedItem,
  type FakeDb,
} from "../../test/testUtils";

const A = PARTNER_A.member.id;
const B = PARTNER_B.member.id;
const ITEM_A = "00000000-0000-4000-8000-000000000001";
const ITEM_B = "00000000-0000-4000-8000-000000000099";
const INITIAL_EVENT = "00000000-0000-4000-8000-00000000e000";
const SETTLE_MS = 250;

const rpcCalls = (rpc: ReturnType<typeof createFakeSupabase>["rpc"], fn: string) =>
  rpc.mock.calls.filter(([name]) => name === fn).map(([, args]) => args as Record<string, unknown>);
const eventSeenCalls = (rpc: ReturnType<typeof createFakeSupabase>["rpc"]) =>
  rpcCalls(rpc, "mark_item_seen_through_events");
const liveSeenCalls = (rpc: ReturnType<typeof createFakeSupabase>["rpc"]) => eventSeenCalls(rpc).slice(1);

const activity = (
  id: string,
  itemId: string,
  eventType = "item_edited",
  extra: Record<string, unknown> = {},
) => ({
  id,
  couple_id: SYNTHETIC_COUPLE_ID,
  actor_member_id: B,
  item_id: itemId,
  event_type: eventType,
  created_at: "2026-02-01T12:00:00Z",
  ...extra,
});

const pause = (milliseconds = SETTLE_MS + 100) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  });

function setupDetail({
  responses = {},
  queryClient = createQueryClient(),
  configure,
}: {
  responses?: Partial<Record<string, Record<string, unknown>>>;
  queryClient?: QueryClient;
  configure?: (db: Partial<FakeDb>) => void;
} = {}) {
  const db: Partial<FakeDb> = {};
  seedItem(db, { id: ITEM_A, title: "Synthetic Original", creatorId: B, responses });
  db.activity_events = [activity(INITIAL_EVENT, ITEM_A, "item_created")];
  configure?.(db);
  const fake = createFakeSupabase({ signedInAs: PARTNER_A, db });
  const user = userEvent.setup();
  return { ...fake, ...renderApp(fake.client, { route: `/ideas/${ITEM_A}`, queryClient }), queryClient, user };
}

async function waitForInitialSeen(rpc: ReturnType<typeof createFakeSupabase>["rpc"]) {
  await screen.findByRole("textbox", { name: "Title" });
  await waitFor(() =>
    expect(eventSeenCalls(rpc)).toEqual([
      { p_item_id: ITEM_A, p_activity_event_ids: [INITIAL_EVENT] },
    ]),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("live updates", () => {
  it("shows a partner's newly shared idea without a refresh", async () => {
    const db: Partial<FakeDb> = {};
    seedItem(db, { title: "Synthetic Existing", creatorId: A, responses: { [A]: { roulette_decision: "ready" } } });
    const fake = createFakeSupabase({ signedInAs: PARTNER_A, db });
    renderApp(fake.client, { route: "/ideas" });
    expect(await screen.findByText("Synthetic Existing")).toBeInTheDocument();

    seedItem(fake.db, {
      id: ITEM_B,
      title: "Synthetic Just Shared",
      creatorId: B,
      responses: { [B]: { roulette_decision: "ready" } },
    });
    expect(screen.queryByText("Synthetic Just Shared")).not.toBeInTheDocument();
    act(() =>
      fake.emitRealtime(
        "activity_events",
        activity("00000000-0000-4000-8000-00000000e001", ITEM_B, "item_created"),
      ),
    );

    expect(await screen.findByText("Synthetic Just Shared")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Synthetic Just Shared/ })).toHaveAccessibleName(/Your turn/);
  });

  it("subscribes only to content-free activity inserts, under a content-free channel name", async () => {
    const fake = createFakeSupabase({ signedInAs: PARTNER_A });
    renderApp(fake.client, { route: "/ideas" });
    await waitFor(() => expect(fake.channels.length).toBeGreaterThan(0));
    const live = fake.channels.filter((entry) => !entry.removed);
    expect(live).toHaveLength(1);
    expect(live[0].name).toBe("ours-activity");
    expect(live[0].listeners.map((listener) => listener.filter)).toEqual([
      { event: "INSERT", schema: "public", table: "activity_events" },
    ]);
  });

  it("closes the subscription on sign-out", async () => {
    const user = userEvent.setup();
    const fake = createFakeSupabase({ signedInAs: PARTNER_A });
    renderApp(fake.client, { route: "/ideas" });
    await waitFor(() => expect(fake.channels.some((entry) => !entry.removed)).toBe(true));
    await user.click(await screen.findByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: /sign out/i }));
    await screen.findByLabelText(/password/i);
    expect(fake.channels.every((entry) => entry.removed)).toBe(true);
  });

  it("refetches the open idea before acknowledging its live event as seen", async () => {
    const { db, rpc, emitRealtime } = setupDetail();
    await waitForInitialSeen(rpc);
    Object.assign(db.items.find((row) => row.id === ITEM_A)!, {
      title: "Synthetic Partner Revision",
      updated_at: "2026-02-01T12:01:00Z",
    });

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e101", ITEM_A)));

    const title = await screen.findByRole("textbox", { name: "Title" });
    await waitFor(() => expect(title).toHaveValue("Synthetic Partner Revision"));
    await waitFor(() =>
      expect(liveSeenCalls(rpc)).toEqual([
        { p_item_id: ITEM_A, p_activity_event_ids: ["00000000-0000-4000-8000-00000000e101"] },
      ]),
    );
  });

  it("does not acknowledge an event for another idea", async () => {
    const { rpc, emitRealtime } = setupDetail({
      configure: (db) => {
        seedItem(db, { id: ITEM_B, title: "Synthetic Other", creatorId: B });
      },
    });
    await waitForInitialSeen(rpc);

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e102", ITEM_B)));
    await pause();

    expect(liveSeenCalls(rpc)).toHaveLength(0);
  });

  it("keeps a hidden live update pending until the refreshed version becomes visible", async () => {
    const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    try {
      const { db, rpc, emitRealtime } = setupDetail();
      await waitForInitialSeen(rpc);
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      Object.assign(db.items.find((row) => row.id === ITEM_A)!, {
        title: "Synthetic Hidden Revision",
        updated_at: "2026-02-01T12:05:00Z",
      });

      act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e103", ITEM_A)));
      await waitFor(() => expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Synthetic Hidden Revision"));
      expect(liveSeenCalls(rpc)).toHaveLength(0);

      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      await waitFor(() =>
        expect(liveSeenCalls(rpc)).toEqual([
          { p_item_id: ITEM_A, p_activity_event_ids: ["00000000-0000-4000-8000-00000000e103"] },
        ]),
      );
    } finally {
      if (visibility) Object.defineProperty(document, "visibilityState", visibility);
      else Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("does not mark an initially hidden idea until it becomes visible", async () => {
    const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    try {
      const { rpc } = setupDetail();
      await screen.findByRole("textbox", { name: "Title" });
      await pause();
      expect(eventSeenCalls(rpc)).toHaveLength(0);

      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      await waitForInitialSeen(rpc);
    } finally {
      if (visibility) Object.defineProperty(document, "visibilityState", visibility);
      else Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("does not loop after a seen write fails and retries only on a new visibility opportunity", async () => {
    const visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    try {
      const { rpc, failNext } = setupDetail();
      failNext("mark_item_seen_through_events", "error");
      await screen.findByRole("textbox", { name: "Title" });
      await waitFor(() => expect(eventSeenCalls(rpc)).toHaveLength(1));
      await pause(500);
      expect(eventSeenCalls(rpc)).toHaveLength(1);

      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      await waitFor(() => expect(eventSeenCalls(rpc)).toHaveLength(2));
    } finally {
      if (visibility) Object.defineProperty(document, "visibilityState", visibility);
      else Reflect.deleteProperty(document, "visibilityState");
    }
  });

  it("does not let an initial acknowledgement cover an event committed after its captured boundary", async () => {
    const queryClient = createQueryClient();
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    let releaseInitialRefresh!: () => void;
    const initialRefreshGate = new Promise<void>((resolve) => {
      releaseInitialRefresh = resolve;
    });
    let paletteCycles = 0;
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(async (filters, options) => {
      if (filters?.queryKey?.length === 1 && filters.queryKey[0] === "palette") {
        paletteCycles += 1;
        if (paletteCycles === 1) await initialRefreshGate;
      }
      return originalInvalidate(filters, options);
    });
    const { db, rpc, emitRealtime } = setupDetail({ queryClient });
    await screen.findByRole("textbox", { name: "Title" });
    await waitFor(() => expect(paletteCycles).toBe(1));

    const laterEvent = activity("00000000-0000-4000-8000-00000000e123", ITEM_A, "comment_added");
    db.activity_events.push(laterEvent);
    act(() => releaseInitialRefresh());
    await waitForInitialSeen(rpc);
    expect(eventSeenCalls(rpc)[0]).toEqual({
      p_item_id: ITEM_A,
      p_activity_event_ids: [INITIAL_EVENT],
    });
    expect(
      db.activity_event_acknowledgements.some((row) => row.activity_event_id === laterEvent.id),
    ).toBe(false);

    act(() => emitRealtime("activity_events", laterEvent));
    await waitFor(() =>
      expect(liveSeenCalls(rpc)).toEqual([
        { p_item_id: ITEM_A, p_activity_event_ids: [laterEvent.id] },
      ]),
    );
  });

  it("runs the initial capture before a matching snapshot published on the list page", async () => {
    const db: Partial<FakeDb> = {};
    seedItem(db, { id: ITEM_A, title: "Synthetic List Original", creatorId: B });
    db.activity_events = [activity(INITIAL_EVENT, ITEM_A, "item_created")];
    const fake = createFakeSupabase({ signedInAs: PARTNER_A, db });
    const user = userEvent.setup();
    renderApp(fake.client, { route: "/ideas" });
    expect(await screen.findByText("Synthetic List Original")).toBeInTheDocument();

    Object.assign(fake.db.items.find((row) => row.id === ITEM_A)!, {
      title: "Synthetic List Revision",
      updated_at: "2026-02-01T12:06:00Z",
    });
    const listEvent = activity("00000000-0000-4000-8000-00000000e124", ITEM_A);
    act(() => fake.emitRealtime("activity_events", listEvent));
    await screen.findByText("Synthetic List Revision");

    await user.click(screen.getByRole("link", { name: /Synthetic List Revision/ }));
    await screen.findByRole("textbox", { name: "Title" });
    await waitFor(() => expect(eventSeenCalls(fake.rpc).length).toBeGreaterThan(0));
    expect(eventSeenCalls(fake.rpc)[0]).toEqual({
      p_item_id: ITEM_A,
      p_activity_event_ids: [INITIAL_EVENT, listEvent.id],
    });
  });

  it("does not acknowledge when the protected refetch fails", async () => {
    const queryClient = createQueryClient();
    const { rpc, emitRealtime } = setupDetail({ queryClient });
    await waitForInitialSeen(rpc);
    vi.spyOn(queryClient, "invalidateQueries").mockRejectedValue(new Error("synthetic protected read failed"));

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e104", ITEM_A)));
    await pause();

    expect(liveSeenCalls(rpc)).toHaveLength(0);
  });

  it("retries a failed immutable snapshot with the next live event", async () => {
    const queryClient = createQueryClient();
    const { rpc, emitRealtime } = setupDetail({
      queryClient,
      configure: (db) => {
        seedItem(db, { id: ITEM_B, title: "Synthetic Other", creatorId: B });
      },
    });
    await waitForInitialSeen(rpc);
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    let failRootPaletteOnce = true;
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters, options) => {
      if (failRootPaletteOnce && filters?.queryKey?.length === 1 && filters.queryKey[0] === "palette") {
        failRootPaletteOnce = false;
        return Promise.reject(new Error("synthetic protected read failed"));
      }
      return originalInvalidate(filters, options);
    });

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e114", ITEM_A)));
    await pause();
    expect(liveSeenCalls(rpc)).toHaveLength(0);

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e115", ITEM_B)));
    await waitFor(() =>
      expect(liveSeenCalls(rpc)).toEqual([
        { p_item_id: ITEM_A, p_activity_event_ids: ["00000000-0000-4000-8000-00000000e114"] },
      ]),
    );
  });

  it("does not strand an event whose debounce expires during a failed refetch", async () => {
    const queryClient = createQueryClient();
    const { rpc, emitRealtime } = setupDetail({
      queryClient,
      configure: (db) => {
        seedItem(db, { id: ITEM_B, title: "Synthetic Other", creatorId: B });
      },
    });
    await waitForInitialSeen(rpc);
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    let rejectFirst!: (error: Error) => void;
    const firstGate = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject;
    });
    let paletteCycles = 0;
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters, options) => {
      if (filters?.queryKey?.length === 1 && filters.queryKey[0] === "palette") {
        paletteCycles += 1;
        if (paletteCycles === 1) return firstGate;
      }
      return originalInvalidate(filters, options);
    });

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e116", ITEM_A)));
    await waitFor(() => expect(paletteCycles).toBe(1));
    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e117", ITEM_B)));
    await pause();
    expect(paletteCycles).toBe(1);

    act(() => rejectFirst(new Error("synthetic protected read failed")));
    await waitFor(() => expect(paletteCycles).toBe(2));
    await waitFor(() => expect(liveSeenCalls(rpc)).toHaveLength(1));
  });

  it("waits for every protected refetch to settle before starting the next cycle", async () => {
    const queryClient = createQueryClient();
    const { rpc, emitRealtime } = setupDetail({ queryClient });
    await waitForInitialSeen(rpc);
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    let releaseActivity!: () => void;
    const activityGate = new Promise<void>((resolve) => {
      releaseActivity = resolve;
    });
    let paletteCycles = 0;
    let holdActivityOnce = true;
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation((filters, options) => {
      if (filters?.queryKey?.length === 1 && filters.queryKey[0] === "palette") {
        paletteCycles += 1;
        if (paletteCycles === 1) return Promise.reject(new Error("synthetic palette read failed"));
      }
      if (holdActivityOnce && filters?.queryKey?.[0] === "activity") {
        holdActivityOnce = false;
        return activityGate;
      }
      return originalInvalidate(filters, options);
    });

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e119", ITEM_A)));
    await waitFor(() => expect(paletteCycles).toBe(1));
    act(() =>
      emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e120", ITEM_A, "comment_added")),
    );
    await pause();
    expect(paletteCycles).toBe(1);
    expect(liveSeenCalls(rpc)).toHaveLength(0);

    act(() => releaseActivity());
    await waitFor(() => expect(paletteCycles).toBe(2));
    await waitFor(() => expect(liveSeenCalls(rpc)).toHaveLength(1));
  });

  it("does not acknowledge while the inline editor is dirty", async () => {
    const { rpc, emitRealtime, user } = setupDetail();
    await waitForInitialSeen(rpc);
    await user.type(screen.getByRole("textbox", { name: "Title" }), " local draft");

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e105", ITEM_A)));
    await pause();

    expect(liveSeenCalls(rpc)).toHaveLength(0);
  });

  it("does not acknowledge while a save is held behind Undo", async () => {
    const { rpc, emitRealtime, user } = setupDetail({ responses: { [B]: { roulette_decision: "ready" } } });
    await waitForInitialSeen(rpc);
    // Only a description change asks again, so only it waits behind Undo.
    await user.type(screen.getByRole("textbox", { name: "Description" }), " held");
    await user.tab();
    expect(await screen.findByRole("status", { name: "Save pending" })).toBeInTheDocument();

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e106", ITEM_A)));
    await pause();

    expect(liveSeenCalls(rpc)).toHaveLength(0);
  });

  it("does not acknowledge while the inline edit is saving", async () => {
    const { rpc, emitRealtime, user, deferNextRpc } = setupDetail();
    await waitForInitialSeen(rpc);
    const save = deferNextRpc("update_item");
    await user.type(screen.getByRole("textbox", { name: "Title" }), " saving");
    await user.tab();
    expect(await screen.findByText("Saving…")).toBeInTheDocument();

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e107", ITEM_A)));
    await pause();
    expect(liveSeenCalls(rpc)).toHaveLength(0);

    act(() => save.release());
    await screen.findByText("Saved");
  });

  it("does not acknowledge while the inline editor is conflicted", async () => {
    const { db, rpc, emitRealtime, user } = setupDetail();
    await waitForInitialSeen(rpc);
    await user.type(screen.getByRole("textbox", { name: "Title" }), " mine");
    Object.assign(db.items.find((row) => row.id === ITEM_A)!, { updated_at: "2026-02-01T12:02:00Z" });
    await user.tab();
    expect(await screen.findByRole("alert")).toHaveTextContent("just changed this");

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e108", ITEM_A)));
    await pause();

    expect(liveSeenCalls(rpc)).toHaveLength(0);
  });

  it("accumulates blocked snapshots and acknowledges them after the refreshed version is explicitly presented", async () => {
    const { db, rpc, emitRealtime, user } = setupDetail();
    await waitForInitialSeen(rpc);
    await user.type(screen.getByRole("textbox", { name: "Title" }), " mine");
    Object.assign(db.items.find((row) => row.id === ITEM_A)!, {
      title: "Synthetic Partner Revision",
      updated_at: "2026-02-01T12:04:00Z",
    });

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e118", ITEM_A)));
    await pause();
    act(() =>
      emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e125", ITEM_A, "comment_added")),
    );
    await pause();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Synthetic Original mine");
    expect(liveSeenCalls(rpc)).toHaveLength(0);

    await user.tab();
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "See theirs" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Synthetic Partner Revision");
    await waitFor(() =>
      expect(liveSeenCalls(rpc)).toEqual([
        {
          p_item_id: ITEM_A,
          p_activity_event_ids: [
            "00000000-0000-4000-8000-00000000e118",
            "00000000-0000-4000-8000-00000000e125",
          ],
        },
      ]),
    );
  });

  it("retains the open idea event when another item is last in the debounce window", async () => {
    const { db, rpc, emitRealtime } = setupDetail({
      configure: (partial) => {
        seedItem(partial, { id: ITEM_B, title: "Synthetic Other", creatorId: B });
      },
    });
    await waitForInitialSeen(rpc);
    Object.assign(db.items.find((row) => row.id === ITEM_A)!, {
      title: "Synthetic Burst Revision",
      updated_at: "2026-02-01T12:03:00Z",
    });

    act(() => {
      emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e109", ITEM_A));
      emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e110", ITEM_B));
    });

    const title = await screen.findByRole("textbox", { name: "Title" });
    await waitFor(() => expect(title).toHaveValue("Synthetic Burst Revision"));
    await waitFor(() =>
      expect(liveSeenCalls(rpc)).toEqual([
        { p_item_id: ITEM_A, p_activity_event_ids: ["00000000-0000-4000-8000-00000000e109"] },
      ]),
    );
  });

  it("serializes an event arriving mid-refetch into a second acknowledgement cycle", async () => {
    const queryClient = createQueryClient();
    const { rpc, emitRealtime } = setupDetail({ queryClient });
    await waitForInitialSeen(rpc);
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    const gates: Array<{ promise: Promise<void>; release: () => void }> = [];
    for (let index = 0; index < 2; index += 1) {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      gates.push({ promise, release });
    }
    let paletteCycles = 0;
    vi.spyOn(queryClient, "invalidateQueries").mockImplementation(async (filters, options) => {
      if (filters?.queryKey?.length === 1 && filters.queryKey[0] === "palette") {
        const gate = gates[paletteCycles++];
        if (gate) await gate.promise;
      }
      return originalInvalidate(filters, options);
    });

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e111", ITEM_A)));
    await waitFor(() => expect(paletteCycles).toBe(1));
    act(() =>
      emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e112", ITEM_A, "comment_added")),
    );
    await pause();
    expect(paletteCycles).toBe(1);
    expect(liveSeenCalls(rpc)).toHaveLength(0);

    act(() => gates[0].release());
    await waitFor(() =>
      expect(liveSeenCalls(rpc)).toEqual([
        { p_item_id: ITEM_A, p_activity_event_ids: ["00000000-0000-4000-8000-00000000e111"] },
      ]),
    );
    await waitFor(() => expect(paletteCycles).toBe(2));
    expect(liveSeenCalls(rpc)).toHaveLength(1);

    act(() => gates[1].release());
    await waitFor(() =>
      expect(liveSeenCalls(rpc)).toEqual([
        { p_item_id: ITEM_A, p_activity_event_ids: ["00000000-0000-4000-8000-00000000e111"] },
        { p_item_id: ITEM_A, p_activity_event_ids: ["00000000-0000-4000-8000-00000000e112"] },
      ]),
    );
  });

  it("does not let an older in-flight acknowledgement consume a newer snapshot", async () => {
    const { rpc, emitRealtime, deferNextRpc } = setupDetail();
    await waitForInitialSeen(rpc);
    const firstLiveMark = deferNextRpc("mark_item_seen_through_events");

    act(() => emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e121", ITEM_A)));
    await waitFor(() => expect(liveSeenCalls(rpc)).toHaveLength(1));
    act(() =>
      emitRealtime("activity_events", activity("00000000-0000-4000-8000-00000000e122", ITEM_A, "comment_added")),
    );
    await pause();
    expect(liveSeenCalls(rpc)).toHaveLength(1);

    act(() => firstLiveMark.release());
    await waitFor(() =>
      expect(liveSeenCalls(rpc)).toEqual([
        { p_item_id: ITEM_A, p_activity_event_ids: ["00000000-0000-4000-8000-00000000e121"] },
        { p_item_id: ITEM_A, p_activity_event_ids: ["00000000-0000-4000-8000-00000000e122"] },
      ]),
    );
  });

  it("ignores content-like payload fields when deciding which idea to acknowledge", async () => {
    const { rpc, emitRealtime } = setupDetail({
      configure: (db) => {
        seedItem(db, { id: ITEM_B, title: "Synthetic Other", creatorId: B });
      },
    });
    await waitForInitialSeen(rpc);

    act(() =>
      emitRealtime(
        "activity_events",
        activity("00000000-0000-4000-8000-00000000e113", ITEM_B, "item_edited", {
          title: ITEM_A,
          description: ITEM_A,
          body: ITEM_A,
          target_item_id: ITEM_A,
        }),
      ),
    );
    await pause();

    expect(liveSeenCalls(rpc)).toHaveLength(0);
  });
});
