import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CATEGORY_NAME_LIMIT, charLength } from "../../domain/model";
import { isUniqueViolation } from "../../lib/errors";
import { useSupabase } from "../../lib/supabaseContext";
import { createCategory, type Category } from "./api";
import { paletteKeys } from "./keys";

const newRequestId = () => crypto.randomUUID();

/** Adds a category by name, idempotently (one request id per attempt until it succeeds). */
export function NewCategory({
  inputId,
  onCreated,
  initiallyOpen = false,
  onCancel,
}: {
  inputId: string;
  onCreated: (category: Category) => void;
  /** Open straight into the name field (used by the inline category menu). */
  initiallyOpen?: boolean;
  onCancel?: () => void;
}) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(initiallyOpen);
  const [name, setName] = useState("");
  const [requestId, setRequestId] = useState(newRequestId);
  const [problem, setProblem] = useState<string | null>(null);
  const errorId = `${inputId}-error`;

  const create = useMutation({
    mutationFn: () => createCategory(client, { requestId, name }),
    onSuccess: (category) => {
      queryClient.setQueryData<Category[]>(paletteKeys.categories(), (current = []) =>
        current.some((existing) => existing.id === category.id) ? current : [...current, category],
      );
      void queryClient.invalidateQueries({ queryKey: paletteKeys.categories() });
      setName("");
      setProblem(null);
      setRequestId(newRequestId());
      setOpen(false);
      onCreated(category);
    },
    onError: (error) => {
      if (isUniqueViolation(error)) {
        // The name is the problem, not the request: a new name gets a fresh request id.
        setRequestId(newRequestId());
        setProblem("You already have a category with that name. Choose it from the list instead.");
      } else {
        setProblem("Category not added. Check your connection and try again.");
      }
    },
  });

  if (!open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        New category
      </button>
    );
  }

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return setProblem("Add a category name.");
    if (charLength(trimmed) > CATEGORY_NAME_LIMIT) {
      return setProblem(`Keep category names to ${CATEGORY_NAME_LIMIT} characters or fewer.`);
    }
    setProblem(null);
    create.mutate();
  };

  return (
    <div className="new-category">
      <label htmlFor={inputId} className="field-label">
        Category name
      </label>
      <div className="category-row">
        <input
          id={inputId}
          type="text"
          autoComplete="off"
          autoFocus
          value={name}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="button-quiet" disabled={create.isPending} onClick={add}>
          {create.isPending ? "Adding…" : "Add category"}
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setOpen(false);
            setProblem(null);
            onCancel?.();
          }}
        >
          Cancel
        </button>
      </div>
      {problem ? (
        <p id={errorId} className="field-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
