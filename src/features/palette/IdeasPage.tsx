import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useOutlet, useSearchParams } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import {
  activeFilterCount,
  filterOptions,
  parseIdeaFilters,
  parseIdeaView,
  selectIdeaView,
  serializeIdeaFilters,
  type IdeaFilters,
  type IdeaView,
  type InboxEntry,
} from "../../domain/inbox";
import { useSupabase } from "../../lib/supabaseContext";
import { submitItem } from "./api";
import { IdeaRow } from "./IdeaRow";
import { activityKeys, paletteKeys, rouletteKeys } from "./keys";
import { FilterPills } from "./FilterPills";
import { useIdeaInbox } from "./useIdeaInbox";

const VIEW_LABELS: Record<IdeaView, string> = { ideas: "Shared", later: "Later", drafts: "My drafts" };
const viewHref = (view: IdeaView) => (view === "ideas" ? "/ideas" : `/ideas?view=${view}`);

/** The Ideas tab. An open idea (child route) renders as a sheet over the list. */
export function IdeasPage() {
  const sheet = useOutlet();
  return (
    <>
      <IdeasList covered={sheet !== null} />
      {sheet}
    </>
  );
}

/** Shared (my turn pinned on top), Later (parked to talk over) and My drafts, over one inbox. */
function IdeasList({ covered }: { covered: boolean }) {
  // Behind an open sheet the list stays mounted (scroll and focus survive) but is inert.
  const cover = covered ? { "aria-hidden": true, inert: true } : {};
  const inbox = useIdeaInbox();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseIdeaView(searchParams);
  const filters = parseIdeaFilters(searchParams);
  const setFilters = (next: IdeaFilters) => setSearchParams(serializeIdeaFilters(next, view), { replace: true });

  const count = activeFilterCount(filters);
  const header = (
    <div className="page-header ideas-header">
      <h1 className="page-title">Ideas</h1>
      <div className="header-actions">
        <Link to="/ideas/new" className="button-primary">
          New
        </Link>
      </div>
    </div>
  );

  if (inbox.status === "pending") {
    return (
      <section className="page ideas-page" {...cover}>
        {header}
        <p role="status" className="loading-state">
          Loading ideas…
        </p>
      </section>
    );
  }

  if (inbox.status === "error") {
    return (
      <section className="page ideas-page" {...cover}>
        {header}
        <EmptyState
          title="Ideas couldn't load"
          actions={
            <button type="button" className="button-primary" onClick={inbox.retry}>
              Try again
            </button>
          }
        >
          <p>Nothing was changed. Check your connection and try again.</p>
        </EmptyState>
      </section>
    );
  }

  const visible = selectIdeaView(inbox.entries, view, filters);
  const counts = inbox.counts;
  const pillOptions = view === "drafts" ? null : filterOptions(selectIdeaView(inbox.entries, view, {}), inbox.categories, filters);
  const now = new Date();
  const row = (entry: InboxEntry, trailing?: ReactNode) => (
    <IdeaRow
      key={entry.item.id}
      entry={entry}
      now={now}
      trailing={trailing}
    />
  );

  return (
    <section className="page ideas-page" {...cover}>
      {header}

      <nav aria-label="Idea views" className="segmented">
        {(Object.keys(VIEW_LABELS) as IdeaView[]).map((key) => {
          const classes = key === view ? "segment is-current" : "segment";
          // A new word on something parked for Later shouldn't go unnoticed.
          const unreadLater = key === "later" && selectIdeaView(inbox.entries, "later", {}).some((entry) => entry.unread);
          return (
            <Link
              key={key}
              to={viewHref(key)}
              className={classes}
              aria-current={key === view ? "page" : undefined}
            >
              {VIEW_LABELS[key]} <span className="segment-count">{counts[key]}</span>
              {unreadLater ? (
                <span className="tab-dot">
                  <span className="visually-hidden">, something new</span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* One row of pills, only for what this view holds; drafts aren't filtered. */}
      {pillOptions && (pillOptions.categories.length > 0 || pillOptions.favorites) ? (
        <FilterPills label="Filter ideas" options={pillOptions} filters={filters} onChange={setFilters} />
      ) : null}

      {visible.length === 0 ? (
        <ViewEmpty
          view={view}
          hasShared={inbox.entries.some((entry) => entry.stage !== "draft")}
          filtered={count > 0}
          partnerName={inbox.partnerName}
        />
      ) : (
        <>
          <ul className="idea-list" aria-label="Ideas">
            {visible.map((entry) =>
              view === "drafts"
                ? row(entry, <ShareDraftButton itemId={entry.item.id} title={entry.item.title} partnerName={inbox.partnerName} />)
                : row(entry),
            )}
          </ul>
          {view === "drafts" ? (
            <p className="list-footnote">Drafts are private until you share them. Sharing counts as your yes.</p>
          ) : null}
        </>
      )}


    </section>
  );
}

function ViewEmpty({
  view,
  hasShared,
  filtered,
  partnerName,
}: {
  view: IdeaView;
  hasShared: boolean;
  filtered: boolean;
  partnerName: string;
}) {
  if (view === "later" && !filtered) {
    return (
      <EmptyState title="Nothing parked for later">
        <p>When one of you isn&apos;t ready yet, Later keeps it here so you can keep talking it over.</p>
      </EmptyState>
    );
  }
  if (view === "drafts") {
    return (
      <EmptyState title="No drafts">
        <p>
          Start one with <Link to="/ideas/new">New</Link>. It stays private until you share it.
        </p>
      </EmptyState>
    );
  }
  if (filtered) {
    return (
      // Clear is in the pill row above: offer it once.
      <EmptyState title="Nothing matches">
        <p>Try another pill, or clear them to see everything.</p>
      </EmptyState>
    );
  }
  if (!hasShared) {
    return (
      <EmptyState
        title="No ideas yet"
        actions={
          <Link to="/ideas/new" className="button-primary">
            New
          </Link>
        }
      >
        <p>Add something either of you would like to imagine, talk about, or try. {partnerName} can respond in their own time.</p>
      </EmptyState>
    );
  }
  // Everything shared is agreed or parked. The counts are on the views and tabs; just point the way.
  return (
    <EmptyState title="All caught up">
      <p>
        Nothing&apos;s waiting on either of you. <Link to="/ideas/new">Share something new</Link> or{" "}
        <Link to="/plan">go plan</Link>.
      </p>
    </EmptyState>
  );
}

function ShareDraftButton({ itemId, title, partnerName }: { itemId: string; title: string; partnerName: string }) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const share = useMutation({
    mutationFn: () => submitItem(client, itemId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paletteKeys.all }),
        queryClient.invalidateQueries({ queryKey: activityKeys.all }),
        queryClient.invalidateQueries({ queryKey: rouletteKeys.all }),
      ]);
    },
  });
  return (
    <>
      <button
        type="button"
        className="button-outline"
        aria-label={`Share ${title} with ${partnerName}`}
        disabled={share.isPending}
        onClick={() => share.mutate()}
      >
        {share.isPending ? "Sharing…" : "Share"}
      </button>
      {share.isError ? (
        <span role="alert" className="field-error row-error">
          Not shared. Try again.
        </span>
      ) : null}
    </>
  );
}
