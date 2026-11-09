/** Browser title on every route. Never include item titles or other private content. */
export const APP_TITLE = "Ours";

export const INTEREST_OPTIONS = [
  { value: "low", label: "Low interest" },
  { value: "curious", label: "Curious" },
  { value: "into_it", label: "Into it" },
  { value: "very_into_it", label: "Very into it" },
] as const;

export const ROULETTE_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "ready", label: "Ready for Roulette" },
  { value: "not_now", label: "Later" },
] as const;
