import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import {
  ITEM_LIMITS,
  charLength,
  validateItemDraft,
  type DraftErrors,
  type Interest,
  type ItemDraft,
} from "../../domain/model";
import { useSupabase } from "../../lib/supabaseContext";
import { useMember } from "../auth/currentMemberContext";
import {
  createItem,
  setInterest as saveInterest,
  submitItem,
  updateItem,
  type Item,
} from "./api";
import { activityKeys, paletteKeys, rouletteKeys } from "./keys";
import { useCategories, useLibraryItems, usePartners } from "./queries";
import { HeatScale } from "./HeatScale";
import { NewCategory } from "./NewCategory";

type ItemEditorProps = {
  /** Pre-filled values for a remix. Never read from the URL. */
  initial?: ItemDraft;
  sourceItemId?: string | null;
  sourceMemoryId?: string | null;
  heading?: string;
};

type SaveAction = "draft" | "share";
type SaveVariables = { action: SaveAction };

class PartialShareError extends Error {
  constructor() {
    super("Saved as a draft, but sharing failed.");
    this.name = "PartialShareError";
  }
}

const EMPTY_DRAFT: ItemDraft = { title: "", description: "", categoryId: "" };

const FIELD_MESSAGES: Record<keyof ItemDraft, Record<"required" | "too_long", string>> = {
  title: {
    required: "Add a title.",
    too_long: `Keep the title to ${ITEM_LIMITS.title} characters or fewer.`,
  },
  description: {
    required: "Add a description.",
    too_long: `Keep the description to ${ITEM_LIMITS.description} characters or fewer.`,
  },
  categoryId: { required: "Choose a category.", too_long: "" },
};

const newRequestId = () => crypto.randomUUID();

export function ItemEditor({
  initial = EMPTY_DRAFT,
  sourceItemId = null,
  sourceMemoryId = null,
  heading = "Add an idea",
}: ItemEditorProps) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const categories = useCategories();
  const member = useMember();
  const partners = usePartners();
  const partnerName =
    partners.data?.find((partner) => partner.id !== member.id)?.display_name ?? "your partner";
  // A create that succeeded but failed to share continues as an update of that draft.
  const createdDraft = useRef<Item | null>(null);

  // Drafts live only in component memory: no autosave, URL, or browser storage.
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  // One request id per create form, reused across retries until a confirmed save.
  const [requestId] = useState(newRequestId);
  // How into it the author is, asked up front so sharing needs no second visit. Optional.
  const [interest, setInterest] = useState<Interest | "">("");
  const allowLeave = useRef(false);

  const ids = {
    title: useId(),
    description: useId(),
    category: useId(),
    newCategory: useId(),
    saveError: useId(),
    dialogTitle: useId(),
    dialogBody: useId(),
  };
  // Quick add: start in the category I used last (my newest idea's, if that category is still active).
  const library = useLibraryItems();
  const lastCategoryId = (() => {
    const active = new Set((categories.data ?? []).map((category) => category.id));
    const mine = (library.data ?? [])
      .filter((item) => item.creator_member_id === member.id && active.has(item.category_id))
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    return mine[0]?.category_id ?? "";
  })();
  // The default isn't an edit: it never makes the form "dirty".
  const categoryId = draft.categoryId || lastCategoryId;
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);

  const dirty =
    draft.title !== initial.title ||
    draft.description !== initial.description ||
    draft.categoryId !== initial.categoryId;

  const save = useMutation({
    mutationFn: async ({ action }: SaveVariables) => {
      const fields = { title: draft.title, description: draft.description, categoryId };
      const existingId = createdDraft.current?.id;
      let item: Item;
      if (existingId) {
        // Still a private draft, so no version check is needed.
        item = await updateItem(client, { itemId: existingId, ...fields });
      } else {
        item = await createItem(client, { requestId, ...fields, sourceItemId, sourceMemoryId });
        createdDraft.current = item;
      }
      // Before sharing, so the partner never sees the idea unrated for a moment. Idempotent on retry.
      if (interest) await saveInterest(client, item.id, interest);
      if (action === "share") {
        try {
          item = await submitItem(client, item.id);
        } catch {
          throw new PartialShareError();
        }
      }
      return item;
    },
    onSettled: () => {
      // A partial share still created a draft, so refresh lists either way.
      void queryClient.invalidateQueries({ queryKey: paletteKeys.all });
    },
    onSuccess: async (item) => {
      allowLeave.current = true;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paletteKeys.all }),
        queryClient.invalidateQueries({ queryKey: activityKeys.all }),
        queryClient.invalidateQueries({ queryKey: rouletteKeys.all }),
      ]);
      navigate(`/ideas/${item.id}`, { replace: true });
    },
  });

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !allowLeave.current && dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (allowLeave.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const keepEditingRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (blocker.state === "blocked") keepEditingRef.current?.focus();
  }, [blocker.state]);

  const setField = (field: keyof ItemDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  function run(action: SaveAction) {
    if (save.isPending) return;
    const nextErrors = validateItemDraft({ ...draft, categoryId });
    setErrors(nextErrors);
    if (nextErrors.title) return titleRef.current?.focus();
    if (nextErrors.description) return descriptionRef.current?.focus();
    if (nextErrors.categoryId) return categoryRef.current?.focus();
    save.mutate({ action });
  }

  // Enter in a field never shares: it saves a draft.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run("draft");
  }

  const fieldError = (field: keyof ItemDraft, id: string) =>
    errors[field] ? (
      <p id={`${id}-error`} className="field-error">
        {FIELD_MESSAGES[field][errors[field]!]}
      </p>
    ) : null;
  const describedBy = (field: keyof ItemDraft, id: string, hint?: string) =>
    [errors[field] ? `${id}-error` : null, hint].filter(Boolean).join(" ") || undefined;

  const pendingAction = save.isPending ? save.variables?.action : undefined;
  const partialShare = save.isError && save.error instanceof PartialShareError;

  return (
    <section className="page editor-page" aria-labelledby={`${ids.title}-heading`}>
      <h1 id={`${ids.title}-heading`} className="page-title">
        {heading}
      </h1>

      <form className="editor-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor={ids.title} className="field-label">
            Title
          </label>
          <input
            ref={titleRef}
            id={ids.title}
            type="text"
            autoComplete="off"
            value={draft.title}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={describedBy("title", ids.title, `${ids.title}-count`)}
            onChange={(event) => setField("title", event.target.value)}
          />
          <p id={`${ids.title}-count`} className="field-hint">
            {charLength(draft.title.trim())}/{ITEM_LIMITS.title}
          </p>
          {fieldError("title", ids.title)}
        </div>

        <div className="field">
          <label htmlFor={ids.description} className="field-label">
            Description <span className="muted-copy">(optional)</span>
          </label>
          <textarea
            ref={descriptionRef}
            id={ids.description}
            rows={7}
            value={draft.description}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={describedBy("description", ids.description, `${ids.description}-count`)}
            onChange={(event) => setField("description", event.target.value)}
          />
          <p id={`${ids.description}-count`} className="field-hint">
            {charLength(draft.description.trim())}/{ITEM_LIMITS.description}
          </p>
          {fieldError("description", ids.description)}
        </div>

        <div className="field">
          <label htmlFor={ids.category} className="field-label">
            Category
          </label>
          <div className="category-row">
            <select
              ref={categoryRef}
              id={ids.category}
              value={categoryId}
              disabled={categories.isPending}
              aria-invalid={errors.categoryId ? true : undefined}
              aria-describedby={describedBy("categoryId", ids.category)}
              onChange={(event) => setField("categoryId", event.target.value)}
            >
              <option value="">{categories.isPending ? "Loading categories…" : "Choose a category"}</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          {fieldError("categoryId", ids.category)}
          {categories.isError ? (
            <p className="field-error">
              Categories couldn't load.{" "}
              <button type="button" className="link-button" onClick={() => void categories.refetch()}>
                Try again
              </button>
            </p>
          ) : null}
          <NewCategory
            inputId={ids.newCategory}
            onCreated={(category) => {
              setField("categoryId", category.id);
              categoryRef.current?.focus();
            }}
          />
        </div>

        <div className="field">
          <HeatScale
            label="How into it are you?"
            value={interest || null}
            onChange={(next) => setInterest(next ?? "")}
            aside={<span className="muted-copy">optional</span>}
          />
        </div>

        {partialShare ? (
          <div id={ids.saveError} role="alert" className="form-error">
            Saved as a draft, but not shared yet. Check your connection and try sharing again.
          </div>
        ) : save.isError ? (
          <div id={ids.saveError} role="alert" className="form-error">
            Not saved yet. Your text is still here. Check your connection and try again.
          </div>
        ) : null}

        <div className="form-actions">
          <>
              <button
                type="submit"
                className="button-quiet"
                disabled={save.isPending}
                aria-describedby={save.isError ? ids.saveError : undefined}
              >
                {pendingAction === "draft" ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={save.isPending}
                aria-describedby={save.isError ? ids.saveError : undefined}
                onClick={() => run("share")}
              >
                {pendingAction === "share" ? "Sharing…" : `Share with ${partnerName}`}
              </button>
          </>
        </div>
      </form>

      {blocker.state === "blocked" ? (
        <div className="dialog-backdrop">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={ids.dialogTitle}
            aria-describedby={ids.dialogBody}
            className="dialog"
          >
            <h2 id={ids.dialogTitle} className="dialog-title">
              Discard this draft?
            </h2>
            <p id={ids.dialogBody}>Your unsaved changes will be lost.</p>
            <div className="state-actions">
              <button
                ref={keepEditingRef}
                type="button"
                className="button-primary"
                onClick={() => blocker.reset()}
              >
                Keep editing
              </button>
              <button type="button" className="button-quiet" onClick={() => blocker.proceed()}>
                Discard draft
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
