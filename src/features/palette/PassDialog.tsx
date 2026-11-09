import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { charLength } from "../../domain/model";
import { useSupabase } from "../../lib/supabaseContext";
import { passItem } from "./api";
import { COMMENT_LIMIT } from "./CommentThread";
import { activityKeys, paletteKeys, rouletteKeys } from "./keys";

/**
 * Not for us (QA 2026-11-03): either of you can close an idea. It archives it for both of you
 * (out of Ideas and Plan); the conversation is kept. The note is optional.
 */
export function PassDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  // Kept across retries so an ambiguous failure can't post the note twice.
  const [requestId] = useState(() => crypto.randomUUID());
  const ids = { title: useId(), body: useId(), field: useId(), error: useId() };
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => fieldRef.current?.focus(), []);

  const pass = useMutation({
    mutationFn: () => passItem(client, { requestId, itemId, note }),
    onSuccess: async () => {
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
    if (pass.isPending) return;
    if (charLength(note.trim()) > COMMENT_LIMIT) return setProblem(`Keep it to ${COMMENT_LIMIT} characters or fewer.`);
    setProblem(null);
    pass.mutate();
  }

  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-labelledby={ids.title} aria-describedby={ids.body} className="dialog">
        <h2 id={ids.title} className="dialog-title">
          Not for me?
        </h2>
        <p id={ids.body}>This archives it for both of you. It leaves Ideas and Plan; the conversation is kept.</p>
        <form onSubmit={handleSubmit} noValidate className="dialog-form">
          <label htmlFor={ids.field} className="field-label">
            Anything you want to say? <span className="muted-copy">(optional)</span>
          </label>
          <textarea
            ref={fieldRef}
            id={ids.field}
            rows={3}
            value={note}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? ids.error : undefined}
            onChange={(event) => setNote(event.target.value)}
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
            <button type="submit" className="button-primary" disabled={pass.isPending}>
              {pass.isPending ? "Saving…" : "Not for me"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
