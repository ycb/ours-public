import { useId, useState } from "react";
import type { Category, PartnerSummary } from "./api";
import { formatDate } from "./labels";
import { useRevisions } from "./queries";

type RevisionHistoryProps = {
  itemId: string;
  partners: PartnerSummary[];
  categories: Category[];
  currentMemberId: string;
};

/** Collapsed by default; each version shows who and when before any content. */
export function RevisionHistory({ itemId, partners, categories, currentMemberId }: RevisionHistoryProps) {
  const revisions = useRevisions(itemId);
  const [open, setOpen] = useState(false);
  const [openVersion, setOpenVersion] = useState<string | null>(null);
  const listId = useId();

  // One version is just the idea as it reads now: nothing to show.
  if (revisions.isPending || revisions.isError || revisions.data.length < 2) return null;

  const nameOf = (memberId: string) =>
    memberId === currentMemberId ? "You" : (partners.find((partner) => partner.id === memberId)?.display_name ?? "Partner");
  const categoryName = (id: string) => categories.find((category) => category.id === id)?.name ?? "Archived category";
  const count = revisions.data.length;

  return (
    <section className="detail-section history-section">
      <h2 className="section-title">
        <button
          type="button"
          className="disclosure"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
        >
          Edit history ({count} {count === 1 ? "version" : "versions"})
        </button>
      </h2>
      {open ? (
        <ol id={listId} className="revision-list">
          {revisions.data.map((revision) => {
            const expanded = openVersion === revision.id;
            return (
              <li key={revision.id} className="revision">
                <button
                  type="button"
                  className="disclosure revision-summary"
                  aria-expanded={expanded}
                  onClick={() => setOpenVersion(expanded ? null : revision.id)}
                >
                  {`Version ${revision.revision_number} · ${nameOf(revision.editor_member_id)} · ${formatDate(revision.created_at)}`}
                </button>
                {expanded ? (
                  <div className="revision-snapshot">
                    <p className="item-category">{categoryName(revision.category_id)}</p>
                    <p className="revision-title">{revision.title}</p>
                    <p className="detail-description">{revision.description}</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}
