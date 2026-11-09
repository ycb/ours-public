import { useEffect, useState } from "react";
import { ReflectSheet } from "../features/dates/ReflectSheet";
import { useDatesView, type DateView } from "../features/dates/useDatesView";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { APP_TITLE } from "../domain/constants";
import { useMember } from "../features/auth/currentMemberContext";
import { LiveUpdateContext } from "../features/palette/liveUpdateContext";
import { useIdeaInbox } from "../features/palette/useIdeaInbox";
import { useLiveUpdates } from "../features/palette/useLiveUpdates";
import { AccountMenu } from "./AccountMenu";

export function AppShell() {
  const member = useMember();
  const location = useLocation();
  const inbox = useIdeaInbox();
  const liveUpdate = useLiveUpdates(member.id);
  const dates = useDatesView();
  const [reflecting, setReflecting] = useState<DateView | null>(null);
  const partnerName = inbox.status === "ready" ? inbox.partnerName : "Your partner";
  const attention = inbox.status === "ready" ? inbox.attention : { ideas: false, plan: false };
  // Totals, not alerts: what's waiting on you is still the dot.
  const counts = inbox.status === "ready"
    ? { ideas: inbox.counts.ideas + inbox.counts.later + inbox.counts.drafts, plan: inbox.counts.agreed }
    : null;
  const total = (n: number | undefined) => (n === undefined ? null : <>{" "}<span className="tab-count">{n}</span></>);

  // Discretion: the browser title never reflects private content or the current route.
  useEffect(() => {
    document.title = APP_TITLE;
  }, [location.pathname]);

  const tabClass = ({ isActive }: { isActive: boolean }) => (isActive ? "tab-link is-active" : "tab-link");

  return (
    <LiveUpdateContext.Provider value={liveUpdate}>
      <div className="app-frame shell-frame">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <header className="site-header shell-header">
          <NavLink to="/ideas" className="wordmark" aria-label="Ours home">
            Ours
          </NavLink>
          {/* Top right on every page; on phones it floats level with the page title. */}
          <AccountMenu name={member.display_name} partnerName={partnerName} toReflect={dates.toReflect} onReflect={setReflecting} />
        </header>

        <main id="main-content" className="main-content shell-main" tabIndex={-1}>
          <Outlet />
        </main>

        <nav aria-label="Primary" className="tab-bar">
          <NavLink to="/ideas" className={tabClass}>
            Ideas
            {total(counts?.ideas)}
            {attention.ideas ? (
              <span className="tab-dot">
                <span className="visually-hidden">, something is waiting on you</span>
              </span>
            ) : null}
          </NavLink>
          <NavLink to="/plan" className={tabClass}>
            Plan
            {total(counts?.plan)}
            {attention.plan ? (
              <span className="tab-dot">
                <span className="visually-hidden">, new messages</span>
              </span>
            ) : null}
          </NavLink>
        </nav>
        {reflecting ? (
          <ReflectSheet
            drawId={reflecting.date.id}
            itemId={reflecting.date.item_id}
            title={reflecting.title}
            onClose={() => setReflecting(null)}
          />
        ) : null}
      </div>
    </LiveUpdateContext.Provider>
  );
}
