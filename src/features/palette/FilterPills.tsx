import { useId } from "react";
import type { IdeaFilters } from "../../domain/inbox";

type Option = { id: string; name: string };

type FilterPillsProps = {
  /** The group's name. On Plan it is shown as a heading ("Pick from"); on Ideas it is for screen readers. */
  label: string;
  /** Shown beside a visible label when nothing is chosen, e.g. "All agreed ideas". */
  allText?: string;
  showLabel?: boolean;
  options: { categories: Option[]; favorites: boolean };
  filters: IdeaFilters;
  onChange: (next: IdeaFilters) => void;
  disabled?: boolean;
};

/**
 * One wrapping row of pills (QA 8): a category (one at a time) and ♥ Favorites. Tapping a chosen
 * pill again un-chooses it; a single Clear appears only when something is chosen.
 */
export function FilterPills({ label, allText, showLabel = false, options, filters, onChange, disabled }: FilterPillsProps) {
  const labelId = useId();
  const active = Boolean(filters.category || filters.favorites);
  const clear = (
    <button type="button" className="link-button filter-clear" aria-label="Clear filters" disabled={disabled} onClick={() => onChange({})}>
      Clear
    </button>
  );
  const pill = (key: string, text: string, current: boolean, next: IdeaFilters) => (
    <button
      key={key}
      type="button"
      className={current ? "category-pill is-current" : "category-pill"}
      aria-pressed={current}
      disabled={disabled}
      onClick={() => onChange(next)}
    >
      {text}
    </button>
  );
  const without = (key: keyof IdeaFilters) => {
    const next = { ...filters };
    delete next[key];
    return next;
  };

  return (
    <div className={showLabel ? "filter-pills is-headed" : "filter-pills"}>
      {showLabel ? (
        <div className="filter-pills-head">
          <span id={labelId} className="field-label">{label}</span>
          {active ? clear : allText ? <span className="muted-copy">{allText}</span> : null}
        </div>
      ) : null}
      <div
        role="group"
        aria-labelledby={showLabel ? labelId : undefined}
        aria-label={showLabel ? undefined : label}
        className="category-pills"
      >
        {options.categories.map((category) => {
          const current = category.id === filters.category;
          return pill(category.id, category.name, current, current ? without("category") : { ...filters, category: category.id });
        })}
        {options.favorites
          ? pill("favorites", "♥ Favorites", Boolean(filters.favorites), filters.favorites ? without("favorites") : { ...filters, favorites: true })
          : null}
        {!showLabel && active ? clear : null}
      </div>
    </div>
  );
}
