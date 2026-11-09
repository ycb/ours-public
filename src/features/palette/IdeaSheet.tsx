import { useCallback, useEffect, useId, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ItemDetailPage } from "./ItemDetailPage";

/** Router state a list row sets, so Close can step back to exactly where the person was. */
export type FromListState = { fromList?: boolean };

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * An idea opens as a sheet over the list (full screen on phones, a centered panel on wider
 * screens). The URL stays /ideas/:id, so links and refreshes work; the list stays mounted
 * underneath, so closing returns to the same place with focus on the row that opened it.
 */
export function IdeaSheet() {
  const navigate = useNavigate();
  const location = useLocation();
  const headingId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const fromList = Boolean((location.state as FromListState | null)?.fromList);

  const close = useCallback(() => {
    if (fromList) navigate(-1);
    else navigate({ pathname: "/ideas", search: location.search }, { replace: true });
  }, [fromList, location.search, navigate]);

  // Remember what opened the sheet, lock page scroll, and put focus inside.
  useEffect(() => {
    opener.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.querySelector<HTMLElement>(".sheet-close")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      const target = opener.current;
      // The opening row is still mounted underneath; give it focus back after the sheet goes.
      requestAnimationFrame(() => {
        if (target instanceof HTMLElement && target.isConnected) target.focus();
      });
    };
  }, []);

  // Escape closes (unless a menu or dialog inside the sheet is open); Tab stays inside.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const nested = sheet.querySelector('[role="menu"], .dialog-backdrop');
      if (event.key === "Escape" && !nested) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const scope = (nested?.closest(".dialog-backdrop") as HTMLElement | null) ?? sheet;
      const focusables = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.closest("[inert]"));
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !scope.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !scope.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div
      className="sheet-overlay"
      onMouseDown={(event) => {
        // A click on the dimmed backdrop (wider screens) closes; clicks inside never do.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby={headingId} className="idea-sheet">
        <div className="sheet-bar">
          <button type="button" className="icon-button sheet-close" aria-label="Close" onClick={close}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <ItemDetailPage headingId={headingId} />
      </div>
    </div>
  );
}
