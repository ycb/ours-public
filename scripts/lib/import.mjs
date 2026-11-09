/**
 * Parsing for the local-only idea importer (scripts/import-ideas.mjs). Nothing here prints or
 * stores content: problems name entries by number, and the summary is counts only.
 *
 * File format (plain text, kept outside the repo):
 *   - Entries are separated by one or more blank lines.
 *   - An entry's first line is its title; any further lines are its description.
 *   - A title with no description uses the title as the description.
 *   - A leading "- ", "* " or "1. " on the title is dropped.
 */
import { createHash } from "node:crypto";

const TITLE_MAX = 120;
const DESCRIPTION_MAX = 4000;

export function parseImport(text) {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);
  const entries = [];
  const problems = [];
  blocks.forEach((lines, index) => {
    const title = lines[0].replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim();
    const description = lines.length > 1 ? lines.slice(1).join("\n") : title;
    const n = index + 1;
    if (!title) problems.push(`entry ${n}: title is empty`);
    else if (title.length > TITLE_MAX) problems.push(`entry ${n}: title is over ${TITLE_MAX} characters`);
    else if (description.length > DESCRIPTION_MAX) problems.push(`entry ${n}: description is over ${DESCRIPTION_MAX} characters`);
    else entries.push({ title, description });
  });
  return { entries, problems };
}

/** A stable request id per entry, so re-running the import never creates an idea twice. */
export function importRequestId({ title, description }) {
  const hex = createHash("sha256").update(`ours-import:v1\n${title}\n${description}`).digest("hex");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function summarize({ entries, problems }) {
  return `${entries.length} ${entries.length === 1 ? "idea" : "ideas"} ready to import, ${problems.length} skipped.`;
}

/** The one category everything lands in; it is re-sorted later in the app. */
export const IMPORT_CATEGORY = "Imported";
export const importCategoryRequestId = (memberId) => importRequestId({ title: "category", description: memberId });

/**
 * Structured import (JSON) for ideas with history:
 *   { "entries": [ { "title", "description", "share"?: true, "partner"?: "in",
 *                    "comments"?: [{ "by": "author" | "partner", "body" }],
 *                    "later"?: { "by": "author" | "partner", "note"? } } ] }
 * Order of effects per entry: create (draft) → share (author's yes) → partner "in" → comments in
 * order → Later. Problems name entries by number only.
 */
export function parseImportJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { entries: [], problems: ["the file is not valid JSON"] };
  }
  if (!data || !Array.isArray(data.entries)) return { entries: [], problems: ["the file needs an entries list"] };
  const entries = [];
  const problems = [];
  const people = new Set(["author", "partner"]);
  data.entries.forEach((raw, index) => {
    const n = index + 1;
    const title = typeof raw?.title === "string" ? raw.title.trim() : "";
    const description = typeof raw?.description === "string" && raw.description.trim() ? raw.description.trim() : title;
    const share = raw?.share === true;
    const partner = raw?.partner === "in" ? "in" : null;
    const comments = Array.isArray(raw?.comments) ? raw.comments : [];
    const later = raw?.later ?? null;
    if (!title) return void problems.push(`entry ${n}: title is empty`);
    if (title.length > TITLE_MAX) return void problems.push(`entry ${n}: title is over ${TITLE_MAX} characters`);
    if (description.length > DESCRIPTION_MAX) return void problems.push(`entry ${n}: description is over ${DESCRIPTION_MAX} characters`);
    if (!share && (partner || comments.length || later)) {
      return void problems.push(`entry ${n}: a partner answer or comments need share: true`);
    }
    if (!comments.every((comment) => people.has(comment?.by) && typeof comment?.body === "string" && comment.body.trim())) {
      return void problems.push(`entry ${n}: comments need by: author or partner, and a body`);
    }
    if (later && !people.has(later.by)) return void problems.push(`entry ${n}: later needs by: author or partner`);
    entries.push({
      title,
      description,
      share,
      partner,
      comments: comments.map((comment) => ({ by: comment.by, body: comment.body.trim() })),
      later: later ? { by: later.by, note: typeof later.note === "string" ? later.note.trim() : "" } : null,
    });
  });
  return { entries, problems };
}
