export type AttributionRevision = {
  revision_number: number;
  editor_member_id: string;
  title: string;
  description: string;
  created_at: string;
};

export type AttributedLine = {
  text: string;
  editorMemberId: string;
  editedAt: string;
};

export type AttributedFields = {
  title: AttributedLine[];
  description: AttributedLine[];
};

const comparable = (line: string) => line.trim().replace(/\s+/g, " ");

function seedLines(text: string, revision: AttributionRevision): AttributedLine[] {
  return text.split("\n").map((line) => ({
    text: line,
    editorMemberId: revision.editor_member_id,
    editedAt: revision.created_at,
  }));
}

/**
 * Carries authorship from the previous snapshot to the next using a line-based LCS. Matching ignores
 * whitespace-only edits, while the current snapshot's exact text is always retained for display.
 */
function replayField(previous: AttributedLine[], nextText: string, revision: AttributionRevision): AttributedLine[] {
  const next = nextText.split("\n");
  const rows = previous.length + 1;
  const columns = next.length + 1;
  const lengths = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let oldIndex = previous.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = next.length - 1; newIndex >= 0; newIndex -= 1) {
      lengths[oldIndex][newIndex] =
        comparable(previous[oldIndex].text) === comparable(next[newIndex])
          ? lengths[oldIndex + 1][newIndex + 1] + 1
          : Math.max(lengths[oldIndex + 1][newIndex], lengths[oldIndex][newIndex + 1]);
    }
  }

  const result: AttributedLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (newIndex < next.length) {
    if (
      oldIndex < previous.length &&
      comparable(previous[oldIndex].text) === comparable(next[newIndex])
    ) {
      result.push({ ...previous[oldIndex], text: next[newIndex] });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }

    if (
      oldIndex < previous.length &&
      lengths[oldIndex + 1][newIndex] >= lengths[oldIndex][newIndex + 1]
    ) {
      oldIndex += 1;
      continue;
    }

    result.push({
      text: next[newIndex],
      editorMemberId: revision.editor_member_id,
      editedAt: revision.created_at,
    });
    newIndex += 1;
  }

  return result;
}

export function attributeLines(revisions: AttributionRevision[]): AttributedFields {
  const ordered = [...revisions].sort(
    (left, right) => left.revision_number - right.revision_number || left.created_at.localeCompare(right.created_at),
  );
  const first = ordered[0];
  if (!first) return { title: [], description: [] };

  let title = seedLines(first.title, first);
  let description = seedLines(first.description, first);
  for (const revision of ordered.slice(1)) {
    title = replayField(title, revision.title, revision);
    description = replayField(description, revision.description, revision);
  }

  return { title, description };
}
