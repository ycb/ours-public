import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { formatAgo } from "../../domain/inbox";
import { deriveRouletteState, isUuid } from "../../domain/model";
import { useSupabase } from "../../lib/supabaseContext";
import { useMember } from "../auth/currentMemberContext";
import {
  archiveItem,
  deleteItem,
  isDeleteRefused,
  listItemActivityEventIds,
  markItemSeen,
  markItemSeenThroughEvents,
  submitItem,
  type ItemDetail,
} from "./api";
import { CommentThread } from "./CommentThread";
import { IdeaAttribution } from "./IdeaAttribution";
import { InlineIdeaFields } from "./InlineIdeaFields";
import { ItemNotFound, type NewItemRouteState } from "./ItemFormPages";
import { activityKeys, paletteKeys, rouletteKeys } from "./keys";
import { useLiveUpdateSnapshot } from "./liveUpdateContext";
import { IdeaDateActions } from "../dates/IdeaDateActions";
import { FavoriteButton, HeatRating, ResponseControls } from "./ResponseControls";
import { MemoryComposer } from "../memories/MemoryComposer";
import { MemoryList } from "../memories/MemoryList";
import { RevisionHistory } from "./RevisionHistory";
import { useCategories, useItemDetail, useItemMemories, usePartners, useRevisions } from "./queries";

/** /ideas/:id/edit predates editing in place; it now opens the idea itself. */
export function EditRedirect() {
  const { itemId } = useParams();
  return <Navigate to={isUuid(itemId) ? `/ideas/${itemId}` : "/ideas"} replace />;
}

/** The idea itself; rendered inside IdeaSheet, which names the dialog after `headingId`. */
export function ItemDetailPage({ headingId }: { headingId?: string }) {
  const { itemId } = useParams();
  const member = useMember();
  const detail = useItemDetail(itemId);
  const partners = usePartners();
  const categories = useCategories();
  const currentItemId = detail.data?.item.id ?? null;
  const [editorState, setEditorState] = useState<{ itemId: string | null; blocked: boolean }>({
    itemId: null,
    blocked: true,
  });
  const onPresentationBlockedChange = useCallback(
    (blocked: boolean) => {
      setEditorState((current) =>
        current.itemId === currentItemId && current.blocked === blocked
          ? current
          : { itemId: currentItemId, blocked },
      );
    },
    [currentItemId],
  );
  const editorBlocked = detail.data?.item.archived_at
    ? false
    : editorState.itemId !== currentItemId || editorState.blocked;
  useMarkSeen(currentItemId, editorBlocked);

  if (!isUuid(itemId)) return <ItemNotFound />;

  if (detail.isPending || partners.isPending || categories.isPending) {
    return (
      <section className="page">
        <p role="status" className="loading-state">
          Loading…
        </p>
      </section>
    );
  }

  if (detail.isError || partners.isError || categories.isError) {
    return (
      <section className="page">
        <p className="field-error">
          This idea couldn&apos;t load.{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              void detail.refetch();
              void partners.refetch();
              void categories.refetch();
            }}
          >
            Try again
          </button>
        </p>
      </section>
    );
  }

  if (!detail.data) return <ItemNotFound />;

  const { item, responses, source, remixes } = detail.data;
  const isCreator = item.creator_member_id === member.id;
  const archived = item.archived_at !== null;
  const isDraft = item.status === "draft";
  const partner = partners.data.find((entry) => entry.id !== member.id);
  const partnerName = partner?.display_name ?? "your partner";
  const nameOf = (memberId: string) =>
    memberId === member.id ? "You" : (partners.data.find((entry) => entry.id === memberId)?.display_name ?? "Partner");
  const own = responses.find((response) => response.member_id === member.id);
  const partnerIsIn = responses.some((response) => response.member_id === partner?.id && response.roulette_decision === "ready");
  const agreed = deriveRouletteState(responses.map((response) => response.roulette_decision)) === "ready";

  const accessory = (
    <>
      {own && !isDraft && !archived ? <FavoriteButton itemId={item.id} response={own} /> : null}
      <IdeaMenu itemId={item.id} canRemix={!isDraft} canDelete={isCreator} />
    </>
  );

  return (
    <article className="detail-page">
      <Byline item={item} isCreator={isCreator} partnerName={partnerName} nameOf={nameOf} />

      {archived ? (
        <header className="detail-header">
          <div className="inline-title-row">
            <h1 id={headingId} className="page-title detail-title">
              {item.title}
            </h1>
            <div className="title-accessory">{accessory}</div>
          </div>
          <IdeaAttribution itemId={item.id} currentMemberId={member.id} partners={partners.data}>
            <p className="detail-description">{item.description}</p>
          </IdeaAttribution>
          <p className="archived-note">This idea is archived. It no longer appears in Ideas or Plan.</p>
        </header>
      ) : (
        <InlineIdeaFields
          key={item.id}
          item={item}
          categories={categories.data}
          partnerName={partnerName}
          currentMemberId={member.id}
          partners={partners.data}
          partnerIsIn={!isDraft && partnerIsIn}
          headingId={headingId}
          titleAccessory={accessory}
          onPresentationBlockedChange={onPresentationBlockedChange}
        />
      )}

      {source ? (
        <p className="item-meta">
          Remixed from <Link to={`/ideas/${source.id}`}>{source.title}</Link>
        </p>
      ) : null}

      {isDraft && isCreator && !archived ? (
        <div className="draft-share">
          {own ? (
            <div className="draft-rating">
              <HeatRating itemId={item.id} response={own} sharedWith={null} />
            </div>
          ) : null}
          <ShareButton itemId={item.id} partnerName={partnerName} />
          <p className="muted-copy">Only you can see this until you share it.</p>
        </div>
      ) : null}

      {isDraft ? null : (
        <>
          <ResponseControls
            itemId={item.id}
            responses={responses}
            partners={partners.data}
            currentMemberId={member.id}
            creatorId={item.creator_member_id}
            readOnly={archived}
          />
          {agreed && !archived ? <IdeaDateActions itemId={item.id} title={item.title} /> : null}
          <CommentThread itemId={item.id} partners={partners.data} currentMemberId={member.id} />
        </>
      )}

      <MemoriesSection itemId={item.id} nameOf={nameOf} show={agreed} />

      {remixes.length > 0 ? (
        <section className="detail-section">
          <h2 className="section-title">Remixed into</h2>
          <ul className="link-list">
            {remixes.map((remix) => (
              <li key={remix.id}>
                <Link to={`/ideas/${remix.id}`}>{remix.title}</Link>
                {remix.archived_at ? <span className="muted-copy"> (archived)</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RevisionHistory itemId={item.id} partners={partners.data} categories={categories.data} currentMemberId={member.id} />
    </article>
  );
}

/** One line: who it's from and the latest thing that happened to the wording. */
function Byline({
  item,
  isCreator,
  partnerName,
  nameOf,
}: {
  item: ItemDetail;
  isCreator: boolean;
  partnerName: string;
  nameOf: (memberId: string) => string;
}) {
  const revisions = useRevisions(item.id);
  const now = new Date();
  const latestEdit = (revisions.data ?? [])
    .filter((revision) => revision.revision_number > 1)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
  const when = latestEdit
    ? `${nameOf(latestEdit.editor_member_id)} edited ${formatAgo(latestEdit.created_at, now)}`
    : item.status === "draft"
      ? `Started ${formatAgo(item.created_at, now)}`
      : `Shared ${formatAgo(item.submitted_at ?? item.created_at, now)}`;
  return (
    <p className="item-meta detail-byline">
      <span className="partner-name">{isCreator ? "From you" : `From ${partnerName}`}</span> · {when}
    </p>
  );
}

function MemoriesSection({
  itemId,
  nameOf,
  show,
}: {
  itemId: string;
  nameOf: (memberId: string) => string;
  show: boolean;
}) {
  const memories = useItemMemories(itemId);
  const [composing, setComposing] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const count = memories.data?.length ?? 0;
  // Memories only make sense once you've agreed (or one already exists).
  if (!show && count === 0) return null;
  const closeComposer = () => {
    setComposing(false);
    requestAnimationFrame(() => addButton.current?.focus());
  };
  return (
    <section className="detail-section">
      <div className="section-header">
        <h2 className="section-title">Memories</h2>
        {composing ? null : (
          <button ref={addButton} type="button" className="button-quiet" onClick={() => setComposing(true)}>
            Add a memory
          </button>
        )}
      </div>
      {composing ? <MemoryComposer itemId={itemId} onSaved={closeComposer} onCancel={closeComposer} /> : null}
      {memories.isPending ? null : memories.isError ? (
        <p className="field-error">
          Memories couldn&apos;t load.{" "}
          <button type="button" className="link-button" onClick={() => void memories.refetch()}>
            Try again
          </button>
        </p>
      ) : count === 0 ? (
        composing ? null : <p className="muted-copy">After you try it together, either of you can add a memory.</p>
      ) : (
        <MemoryList itemId={itemId} memories={memories.data!} nameOf={nameOf} />
      )}
    </section>
  );
}

/** "⋯": Remix and Delete. Archive is offered only when Delete is refused. */
function IdeaMenu({ itemId, canRemix, canDelete }: { itemId: string; canRemix: boolean; canDelete: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  if (!canRemix && !canDelete) return null;
  const remixState: NewItemRouteState = { remixOf: itemId };

  return (
    <div className="menu-anchor">
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open ? (
        <ul ref={menuRef} id={menuId} role="menu" className="menu">
          {canRemix ? (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  navigate("/ideas/new", { state: remixState });
                }}
              >
                Remix
              </button>
            </li>
          ) : null}
          {canDelete ? (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className="menu-item is-danger"
                onClick={() => {
                  setOpen(false);
                  setDeleting(true);
                }}
              >
                Delete…
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {deleting ? (
        <DeleteDialog
          itemId={itemId}
          onClose={() => {
            setDeleting(false);
            buttonRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

/** Records the initial visit and later live updates that were actually presented. */
function useMarkSeen(itemId: string | null, editorBlocked: boolean) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const liveUpdate = useLiveUpdateSnapshot();
  const visibility = useDocumentVisibility();
  const marked = useRef<string | null>(null);
  const handledSequence = useRef(0);
  const pendingLive = useRef<{ itemId: string; sequence: number; eventIds: Set<string> } | null>(null);
  const lastAttemptKey = useRef<string | null>(null);
  const editorBlockedRef = useRef(editorBlocked);
  useEffect(() => {
    editorBlockedRef.current = editorBlocked;
  }, [editorBlocked]);
  const mark = useMutation({
    mutationFn: async ({ id, eventIds }: { id: string; eventIds: string[] | null }) => {
      // Re-check at the final client boundary; visibility can change after the effect was queued.
      if (document.visibilityState !== "visible") return "hidden" as const;
      if (editorBlockedRef.current) return "blocked" as const;

      let presentedEventIds = eventIds;
      if (presentedEventIds === null) {
        // Capture the exact content-free boundary before refetching. An event committed after this
        // read is deliberately left for its own Realtime snapshot.
        presentedEventIds = await listItemActivityEventIds(client, id);
        const results = await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: paletteKeys.all }, { throwOnError: true }),
          queryClient.invalidateQueries({ queryKey: activityKeys.all }, { throwOnError: true }),
          queryClient.invalidateQueries({ queryKey: rouletteKeys.all }, { throwOnError: true }),
        ]);
        if (results.some((result) => result.status === "rejected")) {
          throw new Error("protected initial refresh failed");
        }
      }

      if (document.visibilityState !== "visible") return "hidden" as const;
      if (editorBlockedRef.current) return "blocked" as const;
      if (presentedEventIds.length > 0) await markItemSeenThroughEvents(client, id, presentedEventIds);
      else await markItemSeen(client, id);
      return "marked" as const;
    },
    onSuccess: (result) => {
      if (result === "marked") void queryClient.invalidateQueries({ queryKey: paletteKeys.views() });
    },
  });
  const { isPending, mutate } = mark;

  useEffect(() => {
    pendingLive.current = null;
    lastAttemptKey.current = null;
  }, [itemId]);

  useEffect(() => {
    if (liveUpdate && liveUpdate.sequence > handledSequence.current) {
      handledSequence.current = liveUpdate.sequence;
      const eventIds = itemId
        ? liveUpdate.events.filter((event) => event.itemId === itemId).map((event) => event.id)
        : [];
      if (itemId && eventIds.length > 0) {
        const accumulated = pendingLive.current?.itemId === itemId
          ? new Set(pendingLive.current.eventIds)
          : new Set<string>();
        for (const eventId of eventIds) accumulated.add(eventId);
        pendingLive.current = { itemId, sequence: liveUpdate.sequence, eventIds: accumulated };
      }
    }

    if (!itemId || !visibility.visible || isPending) return;
    const pending = pendingLive.current;
    const liveReady = pending?.itemId === itemId && !editorBlocked;
    const initialReady = marked.current !== itemId && !editorBlocked;
    if (!initialReady && !liveReady) return;
    // An initial capture/refetch establishes everything already presented when an idea opens.
    // A snapshot published on the list page remains pending and is acknowledged idempotently next.
    const liveSequence = !initialReady && liveReady ? pending.sequence : null;
    const liveEventIds = !initialReady && liveReady ? [...pending.eventIds] : null;
    const attemptKey = liveSequence
      ? `live:${itemId}:${liveSequence}:${visibility.revision}`
      : `initial:${itemId}:${visibility.revision}`;
    if (lastAttemptKey.current === attemptKey) return;
    lastAttemptKey.current = attemptKey;

    mutate({ id: itemId, eventIds: liveEventIds }, {
      onSuccess: (result) => {
        if (result === "blocked") lastAttemptKey.current = null;
        if (result !== "marked") return;
        marked.current = itemId;
        if (liveSequence !== null && liveEventIds && pendingLive.current?.itemId === itemId) {
          const remaining = new Set(pendingLive.current.eventIds);
          for (const eventId of liveEventIds) remaining.delete(eventId);
          pendingLive.current = remaining.size > 0
            ? { ...pendingLive.current, eventIds: remaining }
            : null;
        }
      },
    });
  }, [editorBlocked, isPending, itemId, liveUpdate, mutate, visibility]);
}

function useDocumentVisibility() {
  const [visibility, setVisibility] = useState(() => ({
    visible: document.visibilityState === "visible",
    revision: 0,
  }));
  useEffect(() => {
    const sync = () => {
      const visible = document.visibilityState === "visible";
      setVisibility((current) =>
        current.visible === visible ? current : { visible, revision: current.revision + 1 },
      );
    };
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return visibility;
}

function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: paletteKeys.all }),
      queryClient.invalidateQueries({ queryKey: activityKeys.all }),
      queryClient.invalidateQueries({ queryKey: rouletteKeys.all }),
    ]);
}

function ShareButton({ itemId, partnerName }: { itemId: string; partnerName: string }) {
  const client = useSupabase();
  const invalidateAll = useInvalidateAll();
  const share = useMutation({ mutationFn: () => submitItem(client, itemId), onSuccess: invalidateAll });
  return (
    <>
      <button type="button" className="button-primary" disabled={share.isPending} onClick={() => share.mutate()}>
        {share.isPending ? "Sharing…" : `Share with ${partnerName}`}
      </button>
      {share.isError ? (
        <p role="alert" className="field-error">
          Not shared yet. Check your connection and try again.
        </p>
      ) : null}
    </>
  );
}

function DeleteDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const invalidateAll = useInvalidateAll();
  const navigate = useNavigate();
  const ids = { title: useId(), body: useId() };
  const cancelRef = useRef<HTMLButtonElement>(null);
  const leave = async () => {
    await invalidateAll();
    navigate("/ideas", { replace: true });
  };
  const remove = useMutation({
    mutationFn: () => deleteItem(client, itemId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: paletteKeys.item(itemId) });
      await leave();
    },
  });
  const archive = useMutation({ mutationFn: () => archiveItem(client, itemId), onSuccess: leave });
  const refused = isDeleteRefused(remove.error);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div className="dialog-backdrop">
      <div role="alertdialog" aria-modal="true" aria-labelledby={ids.title} aria-describedby={ids.body} className="dialog">
        <h2 id={ids.title} className="dialog-title">
          Delete this idea?
        </h2>
        <p id={ids.body}>This permanently removes it with its answers, messages, and history. It can&apos;t be undone.</p>
        {refused ? (
          <p role="alert" className="field-error">
            Memories, spins, or remixes depend on this idea, so it can&apos;t be deleted. You can archive it instead: it
            leaves Ideas and Plan, and its history stays.
          </p>
        ) : remove.isError || archive.isError ? (
          <p role="alert" className="field-error">
            Nothing changed. Check your connection and try again.
          </p>
        ) : null}
        <div className="state-actions">
          <button ref={cancelRef} type="button" className="button-quiet" onClick={onClose}>
            Cancel
          </button>
          {refused ? (
            <button type="button" className="button-primary" disabled={archive.isPending} onClick={() => archive.mutate()}>
              {archive.isPending ? "Archiving…" : "Archive instead"}
            </button>
          ) : (
            <button
              type="button"
              className="button-primary button-danger-solid"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Deleting…" : "Delete permanently"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
