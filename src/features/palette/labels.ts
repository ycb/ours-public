import { INTEREST_OPTIONS } from "../../domain/constants";
import type { Interest, RouletteState } from "../../domain/model";

export const interestLabel = (value: Interest | null) =>
  value === null ? "Not rated yet" : (INTEREST_OPTIONS.find((option) => option.value === value)?.label ?? "");

/** Overall, derived item state. */
export const ROULETTE_STATE_LABELS: Record<RouletteState, string> = {
  pending: "Pending",
  ready: "Ready to plan",
  not_now: "Later",
};

/**
 * Each person's color class, fixed per person (by sort order), so on both phones the same
 * person is the same color. The accent rose stays reserved for "needs attention".
 */
export const personClass = (memberId: string, partners: readonly { id: string; sort_order: number }[]) => {
  const ordered = [...partners].sort((left, right) => left.sort_order - right.sort_order);
  return ordered.findIndex((partner) => partner.id === memberId) === 1 ? "person-b" : "person-a";
};

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
