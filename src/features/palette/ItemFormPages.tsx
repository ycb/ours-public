import { Link, useLocation } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { isUuid, type ItemDraft } from "../../domain/model";
import { ItemEditor } from "./ItemEditor";

import { useCategories, useItemDetail } from "./queries";

/** Router state for /ideas/new. Only opaque ids; never content. */
export type NewItemRouteState = { remixOf?: string; fromMemory?: string };

export function ItemNotFound() {
  return (
    <section className="page">
      <EmptyState
        headingLevel={1}
        title="This idea isn't available"
        actions={
          <Link to="/ideas" className="button-primary">
            Back to Ideas
          </Link>
        }
      >
        <p>It may have been archived, or the link may be wrong.</p>
      </EmptyState>
    </section>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <section className="page">
      <p role="status" className="loading-state">
        {label}
      </p>
    </section>
  );
}

/** /palette/new — a blank item, or a remix when router state carries a source id. */
export function NewItemPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as NewItemRouteState;
  const remixOf = isUuid(state.remixOf) ? state.remixOf : undefined;
  // "Create a related idea" from a memory: the memory must belong to the source idea (the
  // database enforces this too), so the lineage is only kept when both ids are present.
  const fromMemory = remixOf && isUuid(state.fromMemory) ? state.fromMemory : undefined;
  const source = useItemDetail(remixOf);
  const categories = useCategories();

  if (!remixOf) return <ItemEditor />;
  if (source.isPending || categories.isPending) return <Loading label="Preparing your remix…" />;
  if (source.isError || !source.data) return <ItemNotFound />;

  const { item } = source.data;
  const categoryStillActive = (categories.data ?? []).some((category) => category.id === item.category_id);
  const initial: ItemDraft = {
    title: item.title,
    description: item.description,
    categoryId: categoryStillActive ? item.category_id : "",
  };
  return (
    <ItemEditor
      key={`${remixOf}:${fromMemory ?? ""}`}
      heading={fromMemory ? "A related idea" : "Remix an idea"}
      initial={initial}
      sourceItemId={item.id}
      sourceMemoryId={fromMemory ?? null}
    />
  );
}
