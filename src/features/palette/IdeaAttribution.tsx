import type { ReactNode } from "react";
import type { PartnerSummary } from "./api";
import { AttributionView } from "./AttributionView";
import { useRevisions } from "./queries";

type IdeaAttributionProps = {
  itemId: string;
  currentMemberId: string;
  partners: PartnerSummary[];
  children: ReactNode;
};

/** Adds optional line-level authorship without delaying or replacing the ordinary description. */
export function IdeaAttribution({ itemId, currentMemberId, partners, children }: IdeaAttributionProps) {
  const revisions = useRevisions(itemId);

  return (
    <AttributionView revisions={revisions.data ?? []} currentMemberId={currentMemberId} partners={partners}>
      {children}
    </AttributionView>
  );
}
