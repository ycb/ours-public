import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deriveRouletteState, type Interest, type RouletteDecision } from "../../domain/model";
import { useSupabase } from "../../lib/supabaseContext";
import {
  setFavorite,
  setInterest,
  setRouletteDecision,
  type ItemDetailBundle,
  type ItemResponse,
  type PartnerSummary,
} from "./api";
import { activityKeys, paletteKeys, rouletteKeys } from "./keys";
import { personClass } from "./labels";
import { DeclineDialog } from "./DeclineDialog";
import { HeatScale } from "./HeatScale";
import { heatWords } from "./heatSteps";
import { PassDialog } from "./PassDialog";



function useResponseMutation<T>(itemId: string, write: (value: T) => Promise<ItemResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    // No optimistic success: the UI reflects only what the database confirmed.
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
    },
  });
}

/** My favorite, as a heart beside the title. */
export function FavoriteButton({ itemId, response }: { itemId: string; response: ItemResponse }) {
  const client = useSupabase();
  const favorite = useResponseMutation(itemId, (value: boolean) => setFavorite(client, itemId, value));
  return (
    <button
      type="button"
      className={response.is_favorite ? "icon-button favorite-heart is-on" : "icon-button favorite-heart"}
      aria-label="Favorite"
      aria-pressed={response.is_favorite}
      aria-disabled={favorite.isPending || undefined}
      title={favorite.isError ? "Not saved. Try again." : undefined}
      onClick={() => {
        if (!favorite.isPending) favorite.mutate(!response.is_favorite);
      }}
    >
      <span aria-hidden="true">{response.is_favorite ? "♥" : "♡"}</span>
    </button>
  );
}

type ResponseControlsProps = {
  itemId: string;
  responses: ItemResponse[];
  partners: PartnerSummary[];
  currentMemberId: string;
  /** The idea's author: sharing started them In; they can change it like anyone else. */
  creatorId: string;
  /** Archived ideas keep their history but take no new answers. */
  readOnly?: boolean;
};

const CHOICES: readonly { value: RouletteDecision; label: string; emoji: string }[] = [
  { value: "ready", label: "I'm in", emoji: "✅" },
  { value: "not_now", label: "Maybe later", emoji: "⏳" },
];

/**
 * Variation 3 (QA 2026-11-03): one line about my partner, then my answer (three choices that
 * collapse to one row once given), then the optional heat rating. Later is mutual; Not for me
 * archives for both.
 */
export function ResponseControls({ itemId, responses, partners, currentMemberId, creatorId, readOnly = false }: ResponseControlsProps) {
  const own = responses.find((response) => response.member_id === currentMemberId);
  const partner = partners.find((entry) => entry.id !== currentMemberId);
  const partnerName = partner?.display_name ?? "your partner";
  const theirs = responses.find((response) => response.member_id === partner?.id);
  const agreed = deriveRouletteState(responses.map((response) => response.roulette_decision)) === "ready";
  const editable = Boolean(own) && !readOnly;
  const theirDecision = theirs?.roulette_decision ?? "pending";
  const bothLater = own?.roulette_decision === "not_now" && theirDecision === "not_now";

  const where =
    theirDecision === "ready"
      ? `${partnerName} is in`
      : theirDecision === "not_now"
        ? bothLater
          ? `You both chose Later`
          : `${partnerName} suggests Later`
        : `${partnerName} hasn't answered`;
  const theirHeat = heatWords(theirs?.interest ?? null);

  return (
    <section className="detail-section answer-section" aria-label="Answers and actions">
      <p role="status" aria-label="Where it stands" className={`where-line ${partner ? personClass(partner.id, partners) : ""}`}>
        <span className="where-dot" aria-hidden="true" />
        {where}
        {theirHeat ? (
          <>
            {" · "}
            {theirHeat.short} <span aria-hidden="true">{theirHeat.emoji}</span>
          </>
        ) : null}
        {theirs?.is_favorite ? (
          <>
            {" · "}
            <span aria-hidden="true">♥</span> favorite
          </>
        ) : null}
      </p>

      {agreed ? (
        <Link to="/plan" className="both-in">
          ✓ You&apos;re both in · Ready to plan
        </Link>
      ) : null}

      {own && editable ? (
        <AnswerChoices
          itemId={itemId}
          decision={own.roulette_decision}
          partnerDecision={theirDecision}
          isAuthor={creatorId === currentMemberId}
          partnerName={partnerName}
        />
      ) : null}
      {own && editable ? <HeatRating itemId={itemId} response={own} sharedWith={partnerName} /> : null}
    </section>
  );
}

const SAVED_CUE_MS = 2500;

/** My rating on an idea: the heat bar, saved the moment it changes, with a cue saying who can see it. */
export function HeatRating({
  itemId,
  response,
  sharedWith,
  label = "How into it?",
}: {
  itemId: string;
  response: ItemResponse;
  label?: string;
  /** The partner's name when the idea is shared; null for my private draft. */
  sharedWith: string | null;
}) {
  const client = useSupabase();
  const interest = useResponseMutation(itemId, (value: Interest | null) => setInterest(client, itemId, value));
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => {
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(0), SAVED_CUE_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  return (
    <>
      <HeatScale
        label={label}
        value={response.interest}
        disabled={interest.isPending}
        onChange={(next) => interest.mutate(next, { onSuccess: () => setSavedAt(Date.now()) })}
        aside={
          <span role="status" className="save-state">
            {savedAt ? (sharedWith ? `Saved · ${sharedWith} can see this` : "Saved") : response.interest ? "" : "optional"}
          </span>
        }
      />
      {interest.isError ? (
        <span role="alert" className="save-state save-error">
          Not saved. Try again.
        </span>
      ) : null}
    </>
  );
}

/**
 * My answer as three choices, one tap each; once given, one quiet row with Change. The choices stay
 * open while it's my turn (a partner's Later suggestion, or their edit to my idea).
 */
function AnswerChoices({
  itemId,
  decision,
  partnerDecision,
  isAuthor,
  partnerName,
}: {
  itemId: string;
  decision: RouletteDecision;
  partnerDecision: RouletteDecision;
  isAuthor: boolean;
  partnerName: string;
}) {
  const client = useSupabase();
  const [dialog, setDialog] = useState<"later" | "pass" | null>(null);
  const [changing, setChanging] = useState(false);
  const answer = useResponseMutation(itemId, (value: RouletteDecision) => setRouletteDecision(client, itemId, value));
  const busy = answer.isPending;
  const partnerSuggestsLater = partnerDecision === "not_now" && decision !== "not_now";
  const open = changing || decision === "pending" || partnerSuggestsLater;

  const choose = (value: RouletteDecision | "pass") => {
    if (busy) return;
    if (value === "pass") return setDialog("pass");
    if (value === decision) return setChanging(false);
    if (value === "not_now") return setDialog("later");
    answer.mutate(value, { onSuccess: () => setChanging(false) });
  };

  const hint =
    decision === "not_now" && partnerDecision !== "not_now"
      ? `Waiting for ${partnerName}. It moves to Later once you both choose it.`
      : decision === "pending" && isAuthor
        ? `${partnerName} changed this. Say I'm in to agree to this version.`
        : null;
  const current = CHOICES.find((choice) => choice.value === decision);

  return (
    <div role="group" aria-label="Your answer" className="answer-choices">
      <span className="field-label">Your answer</span>
      {open ? (
        <div className="choice-tiles">
          {[...CHOICES, { value: "pass" as const, label: "Not for me", emoji: "✖️" }].map((choice) => (
            <button
              key={choice.value}
              type="button"
              className={choice.value === decision ? "choice-tile is-on" : "choice-tile"}
              data-emoji={choice.emoji}
              aria-pressed={choice.value === decision}
              aria-disabled={busy || undefined}
              onClick={() => choose(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      ) : current ? (
        <div className="choice-current">
          <span data-emoji={current.emoji}>{current.label}</span>
          <button type="button" className="link-button" onClick={() => setChanging(true)}>
            Change
          </button>
        </div>
      ) : null}
      {hint ? <p className="permission-note">{hint}</p> : null}
      {answer.isError ? (
        <p role="alert" className="save-state save-error">
          Not saved. Check your connection and try again.
        </p>
      ) : null}
      {dialog === "later" ? (
        <DeclineDialog
          itemId={itemId}
          partnerName={partnerName}
          partnerChoseLater={partnerDecision === "not_now"}
          onClose={() => {
            setDialog(null);
            setChanging(false);
          }}
        />
      ) : null}
      {dialog === "pass" ? <PassDialog itemId={itemId} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
