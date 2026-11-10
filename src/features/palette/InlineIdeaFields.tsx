import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ITEM_LIMITS, validateItemDraft, type DraftErrors } from "../../domain/model";
import { useSupabase } from "../../lib/supabaseContext";
import {
  getItemDetail,
  isStaleEdit,
  updateItem,
  type Category,
  type ItemDetail,
  type ItemDetailBundle,
  type PartnerSummary,
} from "./api";
import { IdeaAttribution } from "./IdeaAttribution";
import { activityKeys, paletteKeys, rouletteKeys } from "./keys";
import { NewCategory } from "./NewCategory";

/** When my partner is already in, a description change waits this long behind Undo (it asks them again). */
export const ASKED_AGAIN_DELAY_MS = 5000;
const SAVED_FLASH_MS = 2500;
const NEW_CATEGORY = "__new__";

type Values = { title: string; description: string; categoryId: string };
type Status = "idle" | "held" | "saving" | "saved" | "conflict" | "error";

const valuesOf = (item: ItemDetail): Values => ({
  title: item.title,
  description: item.description,
  categoryId: item.category_id,
});
const same = (left: Values, right: Values) =>
  left.title.trim() === right.title.trim() &&
  left.description.trim() === right.description.trim() &&
  left.categoryId === right.categoryId;

const ERROR_TEXT: Record<keyof Values, Record<NonNullable<DraftErrors["title"]>, string>> = {
  title: { required: "Add a title.", too_long: `Keep the title to ${ITEM_LIMITS.title} characters or fewer.` },
  description: {
    required: "Add a description.",
    too_long: `Keep the description to ${ITEM_LIMITS.description} characters or fewer.`,
  },
  categoryId: { required: "Choose a category.", too_long: "Choose a category." },
};

/** Grows a textarea to fit its text, so an editable field reads like the text it holds. */
function useAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return ref;
}

type InlineIdeaFieldsProps = {
  item: ItemDetail;
  categories: Category[];
  partnerName: string;
  currentMemberId: string;
  partners: PartnerSummary[];
  /** My partner's answer is In: a description change asks them again, so it waits behind Undo. */
  partnerIsIn: boolean;
  /** Shown beside the title (favorite and the overflow menu). */
  titleAccessory?: ReactNode;
  /** Id for the page's h1, so the sheet can be named after the idea. */
  headingId?: string;
  /** True while local state prevents a refreshed partner update from being presented. */
  onPresentationBlockedChange?: (blocked: boolean) => void;
};

/**
 * Title, description and category, edited in place: there is no edit mode. Each field looks like
 * text until focused and saves when you leave it, guarded by the version it was loaded from.
 */
export function InlineIdeaFields({
  item,
  categories,
  partnerName,
  currentMemberId,
  partners,
  partnerIsIn,
  titleAccessory,
  headingId,
  onPresentationBlockedChange,
}: InlineIdeaFieldsProps) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const ids = {
    title: useId(),
    titleError: useId(),
    description: useId(),
    descriptionError: useId(),
    newCategory: useId(),
  };
  const [addingCategory, setAddingCategory] = useState(false);
  const [base, setBase] = useState<ItemDetail>(item);
  const [values, setValues] = useState<Values>(() => valuesOf(item));
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<DraftErrors>({});
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSave = useRef<(() => void) | null>(null);
  const titleRef = useAutoHeight(values.title);
  const descriptionRef = useAutoHeight(values.description);
  const dirty = !same(values, valuesOf(base));
  const presentationBlocked = dirty || status === "held" || status === "saving" || status === "conflict";

  useEffect(() => {
    onPresentationBlockedChange?.(presentationBlocked);
  }, [onPresentationBlockedChange, presentationBlocked]);

  // Adopt newer server versions (live updates, a partner's edit) while I'm not mid-change.
  const busy = status === "held" || status === "saving" || status === "conflict";
  if (item.updated_at !== base.updated_at && item.updated_at > base.updated_at && !busy && same(values, valuesOf(base))) {
    setBase(item);
    setValues(valuesOf(item));
  }

  const write = async (next: Values, expected: string) => {
    pendingSave.current = null;
    setStatus("saving");
    try {
      const saved = await updateItem(client, {
        itemId: item.id,
        title: next.title,
        description: next.description,
        categoryId: next.categoryId,
        expectedUpdatedAt: expected,
      });
      setBase(saved);
      setValues(valuesOf(saved));
      queryClient.setQueryData<ItemDetailBundle | null>(paletteKeys.item(item.id), (current) =>
        current ? { ...current, item: { ...current.item, ...saved } } : current,
      );
      setStatus("saved");
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setStatus((current) => (current === "saved" ? "idle" : current)), SAVED_FLASH_MS);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paletteKeys.all }),
        queryClient.invalidateQueries({ queryKey: activityKeys.all }),
        queryClient.invalidateQueries({ queryKey: rouletteKeys.all }),
      ]);
    } catch (error) {
      setStatus(isStaleEdit(error) ? "conflict" : "error");
    }
  };

  const commit = (next: Values = values) => {
    if (same(next, valuesOf(base))) {
      setErrors({});
      return;
    }
    const found = validateItemDraft(next);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const expected = base.updated_at;
    // Title and category edits never ask again (QA 2026-11-03); only the description does.
    if (!partnerIsIn || next.description.trim() === base.description.trim()) {
      void write(next, expected);
      return;
    }
    clearTimeout(holdTimer.current);
    const run = () => {
      holdTimer.current = undefined;
      void write(next, expected);
    };
    pendingSave.current = run;
    holdTimer.current = setTimeout(run, ASKED_AGAIN_DELAY_MS);
    setStatus("held");
  };

  const undo = () => {
    clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    pendingSave.current = null;
    setValues(valuesOf(base));
    setErrors({});
    setStatus("idle");
  };

  const reload = async (keepMine: boolean) => {
    const fresh = await getItemDetail(client, item.id).catch(() => null);
    if (!fresh) {
      setStatus("error");
      return;
    }
    queryClient.setQueryData(paletteKeys.item(item.id), fresh);
    setBase(fresh.item);
    if (keepMine) {
      void write(values, fresh.item.updated_at);
    } else {
      setValues(valuesOf(fresh.item));
      setStatus("idle");
    }
  };

  // Leaving the page during the Undo window means "keep it": save now.
  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        pendingSave.current?.();
      }
    },
    [],
  );

  const set = (key: keyof Values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const categoryKnown = categories.some((category) => category.id === values.categoryId);

  return (
    <div className="inline-fields">
      <div className="inline-category-row">
        <select
          aria-label="Category"
          className="inline-category"
          value={values.categoryId}
          onChange={(event) => {
            if (event.target.value === NEW_CATEGORY) {
              setAddingCategory(true);
              return;
            }
            const next = { ...values, categoryId: event.target.value };
            setValues(next);
            commit(next);
          }}
        >
          {categoryKnown ? null : <option value={values.categoryId}>Archived category</option>}
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
          <option value={NEW_CATEGORY}>New category…</option>
        </select>
      </div>
      {addingCategory ? (
        <NewCategory
          inputId={ids.newCategory}
          initiallyOpen
          onCancel={() => setAddingCategory(false)}
          onCreated={(category) => {
            setAddingCategory(false);
            const next = { ...values, categoryId: category.id };
            setValues(next);
            commit(next);
          }}
        />
      ) : null}

      <div className="inline-title-row">
        <h1 id={headingId} className="visually-hidden">
          {base.title}
        </h1>
        <textarea
          ref={titleRef}
          id={ids.title}
          aria-label="Title"
          className="inline-title"
          rows={1}
          value={values.title}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? ids.titleError : undefined}
          onChange={(event) => set("title")(event.target.value.replace(/\n/g, " "))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          onBlur={() => commit()}
        />
        {titleAccessory ? <div className="title-accessory">{titleAccessory}</div> : null}
      </div>
      {errors.title ? (
        <p id={ids.titleError} className="field-error">
          {ERROR_TEXT.title[errors.title]}
        </p>
      ) : null}

      <IdeaAttribution itemId={item.id} currentMemberId={currentMemberId} partners={partners}>
        <textarea
          ref={descriptionRef}
          id={ids.description}
          aria-label="Description"
          placeholder="Add details…"
          className="inline-description"
          rows={1}
          value={values.description}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? ids.descriptionError : undefined}
          onChange={(event) => set("description")(event.target.value)}
          onBlur={() => commit()}
        />
      </IdeaAttribution>
      {errors.description ? (
        <p id={ids.descriptionError} className="field-error">
          {ERROR_TEXT.description[errors.description]}
        </p>
      ) : null}

      <SaveNotice
        status={status}
        partnerName={partnerName}
        onUndo={undo}
        onRetry={() => commit()}
        onSeeTheirs={() => void reload(false)}
        onKeepMine={() => void reload(true)}
      />
    </div>
  );
}

function SaveNotice({
  status,
  partnerName,
  onUndo,
  onRetry,
  onSeeTheirs,
  onKeepMine,
}: {
  status: Status;
  partnerName: string;
  onUndo: () => void;
  onRetry: () => void;
  onSeeTheirs: () => void;
  onKeepMine: () => void;
}) {
  if (status === "held") {
    return (
      <div role="status" aria-label="Save pending" className="save-notice is-held">
        <span>{partnerName} will be asked again</span>
        <button type="button" className="link-button" onClick={onUndo}>
          Undo
        </button>
      </div>
    );
  }
  if (status === "conflict") {
    return (
      <div role="alert" className="save-notice is-conflict">
        <span>{partnerName} just changed this.</span>
        <button type="button" className="link-button" onClick={onSeeTheirs}>
          See theirs
        </button>
        <button type="button" className="link-button" onClick={onKeepMine}>
          Keep mine
        </button>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div role="alert" className="save-notice is-error">
        <span>Not saved. Check your connection and try again.</span>
        <button type="button" className="link-button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <p role="status" className="save-notice">
      {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
    </p>
  );
}
