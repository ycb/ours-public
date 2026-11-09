import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { charLength } from "../../domain/model";
import { useSupabase } from "../../lib/supabaseContext";
import { declineItem, type ItemDetailBundle } from "./api";
import { COMMENT_LIMIT } from "./CommentThread";
import { activityKeys, paletteKeys, rouletteKeys } from "./keys";

type DeclineDialogProps = {
  itemId: string;
  partnerName: string;
  /** My partner already chose Later: mine moves it. Otherwise mine is a suggestion (Later is mutual). */
  partnerChoseLater: boolean;
  onClose: () => void;
};

/** Later: park an idea to keep talking it over. The note is optional; when given, it opens that conversation. */
export function DeclineDialog({ itemId, partnerName, partnerChoseLater, onClose }: DeclineDialogProps) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // Kept across retries so an ambiguous failure can't post the reason twice.
  const [requestId] = useState(() => crypto.randomUUID());
  const ids = { title: useId(), body: useId(), field: useId(), error: useId() };
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => fieldRef.current?.focus(), []);

  const decline = useMutation({
    mutationFn: () => declineItem(client, { requestId, itemId, reason }),
    onSuccess: async (saved) => {
      queryClient.setQueryData<ItemDetailBundle | null>(paletteKeys.item(itemId), (current) =>
        current
          ? {
              ...current,
              responses: current.responses.map((response) =>
                response.member_id === saved.member_id ? { ...response, ...saved } : response,
              ),
            }
          : current,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paletteKeys.all }),
        queryClient.invalidateQueries({ queryKey: activityKeys.all }),
        queryClient.invalidateQueries({ queryKey: rouletteKeys.all }),
      ]);
      onClose();
    },
    onError: () => setProblem("Not saved. Your words are still here — check your connection and try again."),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (decline.isPending) return;
    const trimmed = reason.trim();
    if (charLength(trimmed) > COMMENT_LIMIT) {
      return setProblem(`Keep it to ${COMMENT_LIMIT} characters or fewer.`);
    }
    setProblem(null);
    decline.mutate();
  }

  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={ids.title} aria-describedby={ids.body} className="dialog">
        <h2 id={ids.title} className="dialog-title">
          Come back to this later?
        </h2>
        <p id={ids.body}>
          {partnerChoseLater
            ? `You both want to wait. It moves to Later, out of Plan, and you can keep talking about it.`
            : `${partnerName} will see you'd rather wait. It moves to Later once you both choose it; until then you can keep talking about it.`}
        </p>
        <form onSubmit={handleSubmit} noValidate className="dialog-form">
          <label htmlFor={ids.field} className="field-label">
            Anything you&apos;d want to talk about first? <span className="muted-copy">(optional)</span>
          </label>
          <textarea
            ref={fieldRef}
            id={ids.field}
            rows={4}
            value={reason}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? ids.error : undefined}
            onChange={(event) => setReason(event.target.value)}
          />
          {problem ? (
            <p id={ids.error} role="alert" className="field-error">
              {problem}
            </p>
          ) : null}
          <div className="state-actions">
            <button type="button" className="button-quiet" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button-primary" disabled={decline.isPending}>
              {decline.isPending ? "Saving…" : partnerChoseLater ? "Move to Later" : "Suggest Later"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
