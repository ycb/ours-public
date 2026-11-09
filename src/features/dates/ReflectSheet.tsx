import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { whenLabel, type DateWhen } from "../../domain/dates";
import { useSupabase } from "../../lib/supabaseContext";
import { useMember } from "../auth/currentMemberContext";
import { MemoryComposer } from "../memories/MemoryComposer";
import type { NewItemRouteState } from "../palette/ItemFormPages";
import { activityKeys, paletteKeys, rouletteKeys } from "../palette/keys";
import { useItemDetail, useItemMemories, usePartners } from "../palette/queries";
import { HeatRating } from "../palette/ResponseControls";
import { planItem } from "./api";
import { WhenChips } from "./WhenChips";

/**
 * How was it? (QA 2026-11-03.) My partner's answers first, then mine: what I enjoyed and anything to
 * change. Either is enough. Then, if I like: reschedule, make a variation, or change my rating.
 */
export function ReflectSheet({
  drawId,
  itemId,
  title,
  onClose,
}: {
  drawId: string;
  itemId: string;
  title: string;
  onClose: () => void;
}) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const member = useMember();
  const partners = usePartners();
  const memories = useItemMemories(itemId);
  const detail = useItemDetail(itemId);
  const titleId = useId();
  const [savedMemoryId, setSavedMemoryId] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const partner = partners.data?.find((entry) => entry.id !== member.id);
  const partnerName = partner?.display_name ?? "your partner";
  const theirs = (memories.data ?? []).filter((memory) => memory.draw_id === drawId && memory.author_member_id !== member.id);
  const own = detail.data?.responses.find((response) => response.member_id === member.id);

  const reschedule = useMutation({
    mutationFn: (when: DateWhen) => planItem(client, { requestId, itemId, when }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: paletteKeys.all }),
        queryClient.invalidateQueries({ queryKey: rouletteKeys.all }),
        queryClient.invalidateQueries({ queryKey: activityKeys.all }),
      ]),
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const variation = () => {
    // Router state carries only opaque ids; the editor reads content from the server.
    const state: NewItemRouteState = savedMemoryId ? { remixOf: itemId, fromMemory: savedMemoryId } : { remixOf: itemId };
    onClose();
    navigate("/ideas/new", { state });
  };

  return (
    <div className="dialog-backdrop sheet-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog sheet reflect-sheet">
        <h2 id={titleId} className="dialog-title">
          How was {title}?
        </h2>
        {theirs.map((memory) => (
          <div key={memory.id} className="reflect-theirs">
            <p className="reflect-name">{partnerName}</p>
            {memory.body ? (
              <p>
                <span className="memory-label">Enjoyed:</span> {memory.body}
              </p>
            ) : null}
            {memory.refinement ? (
              <p>
                <span className="memory-label">Next time:</span> {memory.refinement}
              </p>
            ) : null}
          </div>
        ))}

        {savedMemoryId ? (
          <p role="status" className="reflect-saved">
            Shared with {partnerName}.
          </p>
        ) : (
          <MemoryComposer
            itemId={itemId}
            drawId={drawId}
            submitLabel={`Share with ${partnerName}`}
            onSaved={(memory) => {
              setSavedMemoryId(memory.id);
              void queryClient.invalidateQueries({ queryKey: paletteKeys.all });
            }}
          />
        )}

        <p className="field-label reflect-then">Then, if you like</p>
        <div className="reflect-actions">
          <button type="button" className="button-outline" aria-expanded={rescheduling} onClick={() => setRescheduling((value) => !value)}>
            <span aria-hidden="true">📅 </span>Reschedule
          </button>
          <button type="button" className="button-outline" onClick={variation}>
            <span aria-hidden="true">✨ </span>Make a variation
          </button>
        </div>
        {rescheduling ? (
          reschedule.isSuccess ? (
            <p role="status" className="reflect-saved">
              Up next · {whenLabel(reschedule.variables ?? null)}
            </p>
          ) : (
            <WhenChips value={null} disabled={reschedule.isPending} onChoose={(when) => reschedule.mutate(when)} />
          )
        ) : null}
        {reschedule.isError ? (
          <p role="alert" className="form-error">
            That didn&apos;t save. Check your connection and try again.
          </p>
        ) : null}
        {own ? <HeatRating itemId={itemId} response={own} sharedWith={partnerName} label="How into it now?" /> : null}
        <button type="button" className="button-quiet reflect-close" onClick={onClose}>
          {savedMemoryId ? "Done" : "Later"}
        </button>
      </div>
    </div>
  );
}
