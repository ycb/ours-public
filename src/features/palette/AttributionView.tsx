import { useId, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { attributeLines, type AttributedLine, type AttributionRevision } from "../../domain/attribution";
import { formatDate, personClass } from "./labels";

type AttributionPartner = { id: string; display_name: string; sort_order: number };

type AttributionViewProps = {
  revisions: AttributionRevision[];
  currentMemberId: string;
  partners: AttributionPartner[];
  children: ReactNode;
};

type AttributedGroup = {
  editorMemberId: string;
  editedAt: string;
  lines: string[];
};

const SWIPE_DISTANCE = 56;

function groupLines(lines: AttributedLine[]): AttributedGroup[] {
  const groups: AttributedGroup[] = [];
  for (const line of lines) {
    const last = groups.at(-1);
    if (last?.editorMemberId === line.editorMemberId && last.editedAt === line.editedAt) {
      last.lines.push(line.text);
    } else {
      groups.push({ editorMemberId: line.editorMemberId, editedAt: line.editedAt, lines: [line.text] });
    }
  }
  return groups;
}

/**
 * Keeps the editable description unchanged by default, with an optional collaboration view. The
 * touch gesture is only a shortcut: the button remains the discoverable keyboard/screen-reader path.
 */
export function AttributionView({ revisions, currentMemberId, partners, children }: AttributionViewProps) {
  const [revealed, setRevealed] = useState(false);
  const regionId = useId();
  const pointerStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const groups = useMemo(() => groupLines(attributeLines(revisions).description), [revisions]);

  const nameOf = (memberId: string) =>
    memberId === currentMemberId
      ? "you"
      : (partners.find((partner) => partner.id === memberId)?.display_name ?? "your partner");

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || start.id !== event.pointerId || revealed) return;
    const horizontal = start.x - event.clientX;
    const vertical = Math.abs(start.y - event.clientY);
    if (horizontal >= SWIPE_DISTANCE && vertical < horizontal / 2) setRevealed(true);
  };

  return (
    <div className={`attribution-view${revealed ? " is-revealed" : ""}`}>
      <div
        className="attribution-plain"
        hidden={revealed}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          pointerStart.current = null;
        }}
      >
        {children}
      </div>

      {revealed ? (
        <div id={regionId} role="region" aria-label="Who wrote what" className="attribution-blocks">
          {groups.map((group, index) => {
            const mine = group.editorMemberId === currentMemberId;
            return (
              <div
                key={`${group.editorMemberId}-${group.editedAt}-${index}`}
                className={`attribution-block ${mine ? "is-mine" : "is-partner"} ${personClass(group.editorMemberId, partners)}`}
              >
                <p className="attribution-label">{`Written by ${nameOf(group.editorMemberId)}, ${formatDate(group.editedAt)}`}</p>
                <p className="attribution-copy">{group.lines.join("\n")}</p>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Who wrote what only means something once both people have written. */}
      {new Set(groups.map((group) => group.editorMemberId)).size > 1 ? (
        <button
          type="button"
          className="attribution-toggle"
          aria-expanded={revealed}
          aria-controls={revealed ? regionId : undefined}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? "Hide who wrote what" : "Who wrote what"}
        </button>
      ) : null}
    </div>
  );
}
