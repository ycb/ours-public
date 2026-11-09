import type { Interest } from "../../domain/model";

/** The heat scale (QA 2026-11-03, variation 3): low to very, each with its emoji. */
export const HEAT_STEPS: readonly { value: Interest; label: string; emoji: string }[] = [
  { value: "low", label: "Low", emoji: "😐" },
  { value: "curious", label: "Curious", emoji: "🤔" },
  { value: "into_it", label: "Into it", emoji: "🙂" },
  { value: "very_into_it", label: "Very into it", emoji: "🤩" },
];

/** The short words and emoji for a rating, for one-line summaries ("very into it 🤩"). */
export function heatWords(value: Interest | null): { short: string; emoji: string } | null {
  const step = HEAT_STEPS.find((entry) => entry.value === value);
  return step ? { short: step.label.toLowerCase(), emoji: step.emoji } : null;
}
