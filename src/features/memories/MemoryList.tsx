import { useNavigate } from "react-router-dom";
import type { Memory } from "../palette/api";
import type { NewItemRouteState } from "../palette/ItemFormPages";
import { formatDate } from "../palette/labels";

const NEXT_TIME = { repeat: "Repeat", refine: "Refine" } as const;

/** Memories on an idea, oldest first: who and when, then only the fields that were filled in. */
export function MemoryList({
  itemId,
  memories,
  nameOf,
}: {
  itemId: string;
  memories: readonly Memory[];
  nameOf: (memberId: string) => string;
}) {
  const navigate = useNavigate();
  return (
    <ul className="comment-list memory-list" aria-label="Memories">
      {memories.map((memory) => {
        // Router state carries only opaque ids; the editor reads content from the server.
        const related: NewItemRouteState = { remixOf: itemId, fromMemory: memory.id };
        return (
          <li key={memory.id} className="comment memory">
            <p className="comment-meta">
              <span className="partner-name">{nameOf(memory.author_member_id)}</span> · {formatDate(memory.created_at)}
            </p>
            {memory.body ? (
              <p className="comment-body">
                <span className="memory-label">Enjoyed:</span> {memory.body}
              </p>
            ) : null}
            {memory.highlight ? (
              <p className="memory-field">
                <span className="memory-label">Especially meaningful:</span> {memory.highlight}
              </p>
            ) : null}
            {memory.next_time ? (
              <p className="memory-field">
                <span className="memory-label">Next time:</span> {NEXT_TIME[memory.next_time]}
              </p>
            ) : null}
            {memory.refinement ? (
              <p className="memory-field">
                <span className="memory-label">Next time:</span> {memory.refinement}
              </p>
            ) : null}
            <button type="button" className="link-button" onClick={() => navigate("/ideas/new", { state: related })}>
              Create a related idea
            </button>
          </li>
        );
      })}
    </ul>
  );
}
