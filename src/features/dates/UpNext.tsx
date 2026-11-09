import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { whenLabel } from "../../domain/dates";
import { useDateMutations } from "./useDateMutations";
import type { DateView } from "./useDatesView";
import { WhenChips } from "./WhenChips";

/** The anticipation strip at the top of Plan, on both phones: what's planned, and when. */
export function UpNext({ dates }: { dates: DateView[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (dates.length === 0) return null;
  const opened = dates.find((entry) => entry.date.id === open);
  return (
    <div className="up-next-list">
      {dates.map(({ date, title }) => (
        <button
          key={date.id}
          type="button"
          className="up-next"
          aria-label={`Up next: ${title}, ${whenLabel(date.planned_when)}`}
          onClick={() => setOpen(date.id)}
        >
          <span className="up-next-copy">
            <span className="up-next-kicker" aria-hidden="true">Up next</span>
            <span className="up-next-title" aria-hidden="true">{title}</span>
          </span>
          <span className="up-next-when" aria-hidden="true">{whenLabel(date.planned_when)}</span>
        </button>
      ))}
      {opened ? <UpNextSheet entry={opened} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function UpNextSheet({ entry, onClose }: { entry: DateView; onClose: () => void }) {
  const { date, title } = entry;
  const { when, done, cancel } = useDateMutations();
  const busy = when.isPending || done.isPending || cancel.isPending;
  const failed = when.isError || done.isError || cancel.isError;
  const titleId = useId();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop sheet-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog sheet date-sheet">
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <p className="muted-copy">Planned for {whenLabel(date.planned_when).toLowerCase()}</p>
        <button
          ref={first}
          type="button"
          className="button-primary date-done"
          aria-disabled={busy || undefined}
          onClick={() => !busy && done.mutate(date.id, { onSuccess: onClose })}
        >
          <span aria-hidden="true">✓ </span>We did it
        </button>
        <span className="field-label">Change when</span>
        <WhenChips label="Change when" value={date.planned_when} disabled={busy} onChoose={(next) => when.mutate({ drawId: date.id, when: next })} />
        <div className="date-sheet-links">
          <Link to={`/ideas/${date.item_id}`} onClick={onClose}>
            Open the idea
          </Link>
          <button type="button" className="link-button" aria-disabled={busy || undefined} onClick={() => !busy && cancel.mutate(date.id, { onSuccess: onClose })}>
            Not anymore
          </button>
        </div>
        {failed ? (
          <p role="alert" className="form-error">
            That didn&apos;t save. Check your connection and try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}
