import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { whenLabel, type DateWhen } from "../../domain/dates";
import { useSupabase } from "../../lib/supabaseContext";
import { activityKeys, paletteKeys, rouletteKeys } from "../palette/keys";
import { planItem } from "./api";
import { ReflectSheet } from "./ReflectSheet";
import { useDatesView } from "./useDatesView";
import { WhenChips } from "./WhenChips";

/**
 * On an agreed idea's page (QA 2026-11-03): "How was it?" when a date has passed and I haven't
 * reflected; otherwise its Up next; otherwise Plan this, to choose it without the deck.
 */
export function IdeaDateActions({ itemId, title }: { itemId: string; title: string }) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const dates = useDatesView();
  const [choosing, setChoosing] = useState(false);
  const [reflecting, setReflecting] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const plan = useMutation({
    mutationFn: (when: DateWhen) => planItem(client, { requestId, itemId, when }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: paletteKeys.all }),
        queryClient.invalidateQueries({ queryKey: rouletteKeys.all }),
        queryClient.invalidateQueries({ queryKey: activityKeys.all }),
      ]),
  });
  if (!dates.ready) return null;

  const due = dates.toReflect.find((entry) => entry.date.item_id === itemId);
  const ahead = dates.upNext.find((entry) => entry.date.item_id === itemId);

  return (
    <div className="idea-date">
      {due ? (
        <>
          <button type="button" className="button-primary" aria-label="How was it? Add yours" onClick={() => setReflecting(true)}>
            How was it? <span className="muted-on-primary">Add yours</span>
          </button>
          {reflecting ? <ReflectSheet drawId={due.date.id} itemId={itemId} title={title} onClose={() => setReflecting(false)} /> : null}
        </>
      ) : ahead || plan.isSuccess ? (
        <p className="idea-date-ahead">
          <span aria-hidden="true">📅 </span>
          <span>Up next · {whenLabel(ahead?.date.planned_when ?? plan.variables ?? null)}</span>
        </p>
      ) : choosing ? (
        <WhenChips value={null} disabled={plan.isPending} onChoose={(when) => plan.mutate(when)} />
      ) : (
        <button type="button" className="button-outline" onClick={() => setChoosing(true)}>
          <span aria-hidden="true">📅 </span>Plan this
        </button>
      )}
      {plan.isError ? (
        <p role="alert" className="form-error">
          That didn&apos;t save. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}
