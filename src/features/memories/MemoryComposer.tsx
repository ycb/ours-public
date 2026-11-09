import { useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { useSupabase } from "../../lib/supabaseContext";
import type { Memory } from "../palette/api";
import { activityKeys, paletteKeys } from "../palette/keys";
import { EMPTY_MEMORY, MEMORY_LIMITS, addMemory, validateMemory, type MemoryDraft, type MemoryErrors } from "./api";

const ERROR_TEXT: Record<keyof MemoryErrors, Record<"required" | "too_long", string>> = {
  body: { required: "", too_long: `Keep it to ${MEMORY_LIMITS.body} characters or fewer.` },
  highlight: { required: "", too_long: `Keep it to ${MEMORY_LIMITS.highlight} characters or fewer.` },
  refinement: { required: "", too_long: `Keep it to ${MEMORY_LIMITS.refinement} characters or fewer.` },
  either: { required: "Write what you enjoyed, or what to change.", too_long: "" },
};

/**
 * Add a memory to an idea, optionally linked to an accepted spin. The draft lives only in this
 * component; its request id is created once, so retrying a save that may have landed never
 * stores a second memory.
 */
export function MemoryComposer({
  itemId,
  drawId = null,
  onSaved,
  onCancel,
  submitLabel = "Save memory",
}: {
  itemId: string;
  drawId?: string | null;
  /** "Share with <partner>" in the reflect sheet. */
  submitLabel?: string;
  onSaved?: (memory: Memory) => void;
  onCancel?: () => void;
}) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const ids = { body: useId(), refinement: useId(), either: useId(), error: useId() };
  const [requestId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState<MemoryDraft>(EMPTY_MEMORY);
  const [errors, setErrors] = useState<MemoryErrors>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const set = (key: keyof MemoryDraft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (inFlight.current) return;
    const found = validateMemory(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    inFlight.current = true;
    setSaving(true);
    setFailed(false);
    try {
      const memory = await addMemory(client, { requestId, itemId, drawId, draft });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paletteKeys.memories(itemId) }),
        queryClient.invalidateQueries({ queryKey: paletteKeys.item(itemId) }),
        queryClient.invalidateQueries({ queryKey: activityKeys.all }),
      ]);
      onSaved?.(memory);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const describedBy = (key: keyof MemoryErrors, id: string) => (errors[key] ? `${id}-error` : undefined);
  const fieldError = (key: keyof MemoryErrors, id: string) =>
    errors[key] ? (
      <p id={`${id}-error`} className="field-error">
        {ERROR_TEXT[key][errors[key]!]}
      </p>
    ) : null;

  return (
    <form
      className="memory-composer"
      aria-label="Add a memory"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="field">
        <label htmlFor={ids.body} className="field-label">
          What did you enjoy?
        </label>
        <textarea
          id={ids.body}
          rows={3}
          value={draft.body}
          aria-invalid={errors.body || errors.either ? true : undefined}
          aria-describedby={errors.either ? `${ids.either}-error` : describedBy("body", ids.body)}
          onChange={(event) => set("body")(event.target.value)}
        />
        {fieldError("body", ids.body)}
      </div>
      <div className="field">
        <label htmlFor={ids.refinement} className="field-label">
          Anything to change or improve for next time?
        </label>
        <textarea
          id={ids.refinement}
          rows={2}
          value={draft.refinement}
          aria-invalid={errors.refinement ? true : undefined}
          aria-describedby={describedBy("refinement", ids.refinement)}
          onChange={(event) => set("refinement")(event.target.value)}
        />
        {fieldError("refinement", ids.refinement)}
      </div>
      {fieldError("either", ids.either)}
      {failed ? (
        <p id={ids.error} role="alert" className="form-error">
          Not saved yet. Your memory is still here. Check your connection and try again.
        </p>
      ) : null}
      <div className="form-actions">
        {onCancel ? (
          <button type="button" className="button-quiet" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="button-primary" disabled={saving} aria-describedby={failed ? ids.error : undefined}>
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
