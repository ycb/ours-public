import { useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { Interest } from "../../domain/model";
import { HEAT_STEPS } from "./heatSteps";

/**
 * How into it, as a cool-to-hot bar with four steps. Presentational: the caller decides what a
 * change does (save at once on an idea, or hold it in a form). Real radio buttons underneath, so
 * keyboard and screen readers work as usual; tapping the chosen step again clears it; the marker can
 * be dragged.
 */
export function HeatScale({
  label,
  value,
  onChange,
  aside,
  disabled = false,
}: {
  label: ReactNode;
  value: Interest | null;
  onChange: (next: Interest | null) => void;
  /** Right of the label: "optional", or a save cue. */
  aside?: ReactNode;
  disabled?: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const name = useId();
  const currentIndex = HEAT_STEPS.findIndex((step) => step.value === value);
  const shownIndex = dragIndex ?? currentIndex;

  const choose = (next: Interest | null) => {
    if (!disabled) onChange(next);
  };
  const indexAt = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return currentIndex;
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 0.9999);
    return Math.floor(ratio * HEAT_STEPS.length);
  };
  const onThumbDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragIndex(indexAt(event.clientX));
  };
  const onThumbMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (dragIndex !== null) setDragIndex(indexAt(event.clientX));
  };
  const onThumbUp = () => {
    if (dragIndex !== null && dragIndex !== currentIndex) choose(HEAT_STEPS[dragIndex].value);
    setDragIndex(null);
  };

  return (
    <div className="heat-rating">
      <div className="heat-head">
        <span className="field-label" id={`${name}-label`}>
          {label}
        </span>
        {aside}
      </div>
      <div role="radiogroup" aria-labelledby={`${name}-label`} className="heat" ref={bar}>
        <div className="heat-bar" aria-hidden="true" />
        {shownIndex >= 0 ? (
          <span
            className={dragIndex !== null ? "heat-thumb is-dragging" : "heat-thumb"}
            style={{ left: `${(shownIndex + 0.5) * (100 / HEAT_STEPS.length)}%` }}
            aria-hidden="true"
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
            onPointerCancel={() => setDragIndex(null)}
          >
            {HEAT_STEPS[shownIndex].emoji}
          </span>
        ) : null}
        <div className="heat-steps">
          {HEAT_STEPS.map((step, index) => (
            <label key={step.value} className={index === shownIndex ? "heat-step is-on" : "heat-step"}>
              <input
                type="radio"
                name={name}
                className="visually-hidden"
                aria-label={step.label}
                checked={value === step.value}
                aria-disabled={disabled || undefined}
                onChange={() => undefined}
                onClick={() => choose(value === step.value ? null : step.value)}
              />
              {shownIndex < 0 ? <span aria-hidden="true">{step.emoji} </span> : null}
              <span aria-hidden="true">{step.value === "very_into_it" ? "Very" : step.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
