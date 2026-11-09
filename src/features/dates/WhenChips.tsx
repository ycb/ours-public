import { DATE_WHENS, whenLabel, type DateWhen } from "../../domain/dates";

/** Tonight · This weekend · Sometime. One tap; the chosen one is pressed. */
export function WhenChips({
  label = "When?",
  value,
  onChoose,
  disabled = false,
}: {
  label?: string;
  value: DateWhen | null;
  onChoose: (when: DateWhen) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="when-chips">
      {DATE_WHENS.map((when) => (
        <button
          key={when}
          type="button"
          className={when === value ? "when-chip is-on" : "when-chip"}
          aria-pressed={when === value}
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (!disabled) onChoose(when);
          }}
        >
          {whenLabel(when)}
        </button>
      ))}
    </div>
  );
}
