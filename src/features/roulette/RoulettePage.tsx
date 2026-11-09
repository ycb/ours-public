import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { useSupabase } from "../../lib/supabaseContext";
import type { IdeaFilters } from "../../domain/inbox";
import type { DateWhen } from "../../domain/dates";
import { useDateMutations } from "../dates/useDateMutations";
import { WhenChips } from "../dates/WhenChips";
import { paletteKeys } from "../palette/keys";
import {
  drawRoulette,
  isUnavailableCandidate,
  isUnavailableCategory,
  recordRouletteOutcome,
  type RouletteCandidate,
  type RouletteDraw,
} from "./api";

type Category = { id: string; name: string };

/** How the pick is revealed (QA 2026-10-30: concepts A and B). Each viewer chooses; it is a look, not data. */
export type RevealStyle = "card" | "note";
const STYLE_KEY = "ours.revealStyle";
/** The card's lift-and-turn; the pick is shown when both the deal and the draw are done. */
export const DEAL_MS = 900;
/** How long the seal must be held. */
export const HOLD_MS = 900;

const COPY: Record<RevealStyle, { trigger: string; hint: string; busy: string; kicker: string; another: string }> = {
  card: { trigger: "Deal a card", hint: "Tap the deck to deal", busy: "Dealing…", kicker: "Your card", another: "Deal another" },
  note: {
    trigger: "Open a sealed note",
    hint: "Press and hold the seal",
    busy: "Opening…",
    kicker: "Tonight, how about…",
    another: "Draw another",
  },
};

// Browser storage is a per-viewer convenience only; it may be missing or throw.
function readStyle(): RevealStyle {
  try {
    return window.localStorage.getItem(STYLE_KEY) === "note" ? "note" : "card";
  } catch {
    return "card";
  }
}
function writeStyle(style: RevealStyle) {
  try {
    window.localStorage.setItem(STYLE_KEY, style);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Spin over agreed ideas: deal a card, or open a sealed note. One primary action on the result
 * ("Let's do it"); "Deal another" is a quiet link back to the deck (or seal) and stores nothing. Plan keeps this mounted while
 * the inbox refreshes, so a result (or an unsaved choice and its request id) survives a background
 * refetch or a partner's change. With nothing agreed and nothing on screen it renders nothing.
 */
export function RoulettePanel({
  categories,
  filters,
  onFiltersChange,
  hasAgreed,
}: {
  categories: Category[];
  /** Set by the pill row under Plan's list; one row filters both the list and the deck (QA 8, 11). */
  filters: IdeaFilters;
  onFiltersChange: (next: IdeaFilters) => void;
  hasAgreed: boolean;
}) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  // State updates are async; a ref closes the double-click window before the re-render lands.
  const inFlight = useRef(false);
  const [style, setStyle] = useState<RevealStyle>(readStyle);
  const categoryId = filters.category ?? null;
  const favoritesOnly = Boolean(filters.favorites);
  const [candidate, setCandidate] = useState<RouletteCandidate | null>(null);
  const [accepted, setAccepted] = useState<RouletteDraw | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  // Set once Let's do it was tried: after an unclear failure the same pick must be retried, not replaced.
  const [saveTried, setSaveTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [holding, setHolding] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { when: dateWhen } = useDateMutations();
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const acceptedAnother = useRef<HTMLButtonElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const copy = COPY[style];
  const selectedCategory = categories.find((category) => category.id === categoryId);
  // What the deck deals from, said on the deck, since the filters now sit below it with the list.
  const source = [selectedCategory?.name, favoritesOnly ? "♥" : null].filter(Boolean).join(" ");
  const fromLine = source ? ` · from ${selectedCategory ? source : "♥ Favorites"}` : "";

  // A filter change (from the pills under the list) clears an unsaved pick, recording nothing.
  // The archived-category recovery changes the filter too, but keeps its explanation.
  const filterKey = `${categoryId ?? ""}|${favoritesOnly}`;
  const [shownKey, setShownKey] = useState(filterKey);
  const [keepErrorOnFilterChange, setKeepErrorOnFilterChange] = useState(false);
  if (shownKey !== filterKey) {
    setShownKey(filterKey);
    setCandidate(null);
    setAccepted(null);
    setRequestId(null);
    setSaveTried(false);
    setEmpty(false);
    if (!keepErrorOnFilterChange) setError(null);
    setKeepErrorOnFilterChange(false);
  }
  const reduceMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const clearPick = () => {
    setCandidate(null);
    setAccepted(null);
    setRequestId(null);
    setSaveTried(false);
  };

  const reveal = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    // The deal plays while the server picks; the pick appears once both are done.
    const dealing = style === "card" && !reduceMotion;
    if (dealing) setDealing(true);
    try {
      const [next] = await Promise.all([drawRoulette(client, categoryId, favoritesOnly), wait(dealing ? DEAL_MS : 0)]);
      clearPick();
      setCandidate(next);
      setEmpty(!next);
      setRequestId(next ? crypto.randomUUID() : null);
      if (next) requestAnimationFrame(() => heading.current?.focus());
    } catch (caught) {
      if (isUnavailableCategory(caught)) {
        clearPick();
        setEmpty(false);
        const rest = { ...filters };
        delete rest.category;
        setKeepErrorOnFilterChange(true);
        onFiltersChange(rest);
        setError("That category isn't available anymore. Pick from all agreed ideas, or another category.");
        void queryClient.invalidateQueries({ queryKey: paletteKeys.categories() });
      } else {
        setError("That didn't work. Nothing was saved; try again.");
      }
    } finally {
      inFlight.current = false;
      setDealing(false);
      setBusy(false);
    }
  };

  // Sealed note: hold to open. Keyboard and switch users (a click with no pointer) open it directly,
  // and so does anyone who asked for reduced motion.
  const startHold = (event: PointerEvent<HTMLButtonElement>) => {
    if (busy || reduceMotion || event.button !== 0) return;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      setHolding(false);
      void reveal();
    }, HOLD_MS);
  };
  const cancelHold = () => {
    if (!holdTimer.current) return;
    clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    setHolding(false);
  };

  const accept = async () => {
    if (inFlight.current || !candidate) return;
    inFlight.current = true;
    const stableRequestId = requestId ?? crypto.randomUUID();
    if (!requestId) setRequestId(stableRequestId);
    setSaveTried(true);
    setBusy(true);
    setError(null);
    try {
      const draw = await recordRouletteOutcome(client, {
        requestId: stableRequestId,
        itemId: candidate.id,
        categoryId,
        outcome: "accepted",
      });
      setAccepted(draw);
      requestAnimationFrame(() => acceptedAnother.current?.focus());
    } catch (caught) {
      if (isUnavailableCandidate(caught)) {
        clearPick();
        setError("That idea's availability changed. Pick again from what's agreed now.");
        requestAnimationFrame(() => trigger.current?.focus());
      } else {
        setError("That couldn't be saved. Try again.");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // Another pick starts over at the deck or the seal, so every pick is dealt or opened, never swapped in.
  const startOver = () => {
    clearPick();
    setEmpty(false);
    setError(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };

  const chooseStyle = (next: RevealStyle) => {
    setStyle(next);
    writeStyle(next);
  };

  if (!hasAgreed && !candidate) return null;

  const anotherButton = (ref?: typeof acceptedAnother) => (
    <button ref={ref} type="button" className="link-button roulette-another" disabled={busy || (saveTried && !accepted)} onClick={startOver}>
      {copy.another}
    </button>
  );

  return (
    <div className="roulette-block">
      {/* The look is a per-viewer choice, so it sits quietly above the card, top right. */}
      <div role="group" aria-label="Reveal style" className="roulette-style">
        {(["card", "note"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={value === style ? "style-option is-current" : "style-option"}
            aria-pressed={value === style}
            disabled={busy}
            onClick={() => chooseStyle(value)}
          >
            {value === "card" ? "Card" : "Sealed note"}
          </button>
        ))}
      </div>
    <div className={`spin-panel roulette reveal-${style}`}>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      {/* Always mounted, so screen readers announce the text when it changes. */}
      <p role="status" className="roulette-status">
        {empty ? (
          <>
            {`No agreed ${favoritesOnly ? "favorites" : "ideas"} ${selectedCategory ? `in ${selectedCategory.name}` : "are ready yet"}.`}{" "}
            An idea can come up once you&apos;re both in on it. <Link to="/ideas">Go to Ideas</Link>
          </>
        ) : null}
      </p>

      {!candidate ? (
        <div className="roulette-stage">
          {style === "card" ? (
            <button
              ref={trigger}
              type="button"
              className={dealing ? "deck is-dealing" : "deck"}
              aria-label={copy.trigger}
              disabled={busy}
              onClick={() => void reveal()}
            >
              <span className="deck-card deck-card-3" aria-hidden="true" />
              <span className="deck-card deck-card-2" aria-hidden="true" />
              <span className="deck-card deck-card-top" aria-hidden="true">
                <span className="deck-mark">Ours</span>
              </span>
            </button>
          ) : (
            <button
              ref={trigger}
              type="button"
              className={holding ? "envelope is-holding" : "envelope"}
              aria-label={copy.trigger}
              disabled={busy}
              onPointerDown={startHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
              onContextMenu={(event) => event.preventDefault()}
              onClick={(event) => {
                // detail 0: keyboard or assistive activation. Reduced motion: a tap opens it.
                if (event.detail === 0 || reduceMotion) void reveal();
              }}
            >
              <span className="envelope-body" aria-hidden="true" />
              <span className="envelope-flap" aria-hidden="true" />
              <span className="envelope-seal" aria-hidden="true">O</span>
              <svg className="envelope-ring" aria-hidden="true" width="104" height="104" viewBox="0 0 104 104">
                <circle cx="52" cy="52" r="48" />
              </svg>
            </button>
          )}
          <p className="roulette-hint" aria-hidden="true">{busy ? copy.busy : `${reduceMotion && style === "note" ? "Tap the seal" : copy.hint}${fromLine}`}</p>
        </div>
      ) : (
        <section className="roulette-result" aria-live="polite">
          <div className={reduceMotion ? "roulette-result-copy" : "roulette-result-copy roulette-result-motion"}>
            <p className="roulette-kicker">{accepted ? "It's a date." : copy.kicker}</p>
            <h2 ref={heading} tabIndex={-1}>{candidate.title}</h2>
            <p className="roulette-description">{candidate.description}</p>
            {accepted ? null : (
              <p className="muted-copy">This saves the pick for you both. Either of you can still change course.</p>
            )}
          </div>
          {accepted ? (
            <>
              {/* The pick is a date now: when? (optional). How it was comes after, from the avatar. */}
              <WhenChips
                value={(accepted.planned_when as DateWhen | null) ?? null}
                disabled={dateWhen.isPending}
                onChoose={(when) => dateWhen.mutate({ drawId: accepted.id, when }, { onSuccess: (draw) => setAccepted(draw) })}
              />
              <div className="roulette-actions">{anotherButton(acceptedAnother)}</div>
            </>
          ) : (
            <div className="roulette-actions">
              <button type="button" className="button-primary roulette-accept" disabled={busy} onClick={() => void accept()}>
                {busy ? "Saving…" : "Let's do it"}
              </button>
              {anotherButton()}
            </div>
          )}
        </section>
      )}
    </div>
    </div>
  );
}
