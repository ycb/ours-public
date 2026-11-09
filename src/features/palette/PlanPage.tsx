import type { ReactNode } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import {
  activeFilterCount,
  filterOptions,
  parseIdeaFilters,
  selectIdeaView,
  serializeIdeaFilters,
  type IdeaFilters,
} from "../../domain/inbox";
import { UpNext } from "../dates/UpNext";
import { useDatesView } from "../dates/useDatesView";
import { IdeaRow } from "./IdeaRow";
import { FilterPills } from "./FilterPills";
import { useIdeaInbox, type IdeaInbox } from "./useIdeaInbox";
import { RoulettePanel } from "../roulette/RoulettePage";

type ReadyInbox = Extract<IdeaInbox, { status: "ready" }>;

function InboxGate({ title, children }: { title: string; children: (inbox: ReadyInbox) => ReactNode }) {
  const inbox = useIdeaInbox();
  if (inbox.status === "pending") {
    return (
      <section className="page plan-page">
        <h1 className="page-title">{title}</h1>
        <p role="status" className="loading-state">
          Loading…
        </p>
      </section>
    );
  }
  if (inbox.status === "error") {
    return (
      <section className="page plan-page">
        <h1 className="page-title">{title}</h1>
        <EmptyState
          title="Plan couldn't load"
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
  return <>{children(inbox)}</>;
}

/**
 * Plan: the deck, then every agreed idea with one row of filter pills that also sets what the deck
 * deals from (QA 2026-11-03). Agreed ideas leave Ideas, so they
 * must be plainly here: reviewing and talking about them carries on after agreeing (QA 2026-10-30).
 */
export function PlanPage() {
  const dates = useDatesView();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters: IdeaFilters = parseIdeaFilters(searchParams);
  // Filters only; Plan has no views. One pill row (in the panel) filters both the deck and the list.
  const setFilters = (next: IdeaFilters) => setSearchParams(serializeIdeaFilters(next, "ideas"), { replace: true });

  return (
    <InboxGate title="Plan">
      {(inbox) => {
        const allAgreed = selectIdeaView(inbox.entries, "agreed", {});
        const agreed = selectIdeaView(inbox.entries, "agreed", filters);
        const now = new Date();
        return (
          <section className="page plan-page">
            <div className="page-header ideas-header">
              <h1 className="page-title">Plan</h1>
            </div>
            {/* Anticipation first: what's planned, on both phones (QA 2026-11-03). */}
            <UpNext dates={dates.upNext} />
            {/* Mounted in one place whatever the agreed count, so Spin keeps its result. */}
            <RoulettePanel
              categories={inbox.categories}
              filters={filters}
              onFiltersChange={setFilters}
              hasAgreed={allAgreed.length > 0}
            />
            {allAgreed.length === 0 ? (
              <EmptyState title="Nothing agreed yet">
                <p>
                  Once you&apos;re both in on an idea, it moves here, ready to spin. Start in{" "}
                  <Link to="/ideas">Ideas</Link>.
                </p>
              </EmptyState>
            ) : (
              <section className="plan-section" aria-labelledby="plan-agreed">
                <h2 id="plan-agreed" className="section-title">
                  {activeFilterCount(filters) > 0
                    ? `${agreed.length} of ${allAgreed.length} ready to plan`
                    : allAgreed.length === 1
                      ? "1 idea ready to plan"
                      : `${allAgreed.length} ideas ready to plan`}
                </h2>
                {/* One row of pills under the count filters both this list and the deck above. */}
                <FilterPills label="Filter ideas" options={filterOptions(allAgreed, inbox.categories, filters)} filters={filters} onChange={setFilters} />
                {agreed.length === 0 ? (
                  // Clear is in the pill row above: offer it once.
                  <EmptyState title="Nothing matches">
                    <p>Try another pill.</p>
                  </EmptyState>
                ) : (
                  <ul className="idea-list" aria-label="Agreed ideas">
                    {agreed.map((entry) => (
                      <IdeaRow key={entry.item.id} entry={entry} now={now} hideAgreed />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </section>
        );
      }}
    </InboxGate>
  );
}

export function AgreedPage() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/plan", search: location.search }} replace />;
}
