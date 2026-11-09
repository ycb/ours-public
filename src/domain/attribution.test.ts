import { describe, expect, it } from "vitest";
import { attributeLines, type AttributionRevision } from "./attribution";

const revision = (
  revisionNumber: number,
  editorMemberId: string,
  title: string,
  description: string,
): AttributionRevision => ({
  revision_number: revisionNumber,
  editor_member_id: editorMemberId,
  title,
  description,
  created_at: `2026-10-${String(20 + revisionNumber).padStart(2, "0")}T12:00:00Z`,
});

describe("attributeLines", () => {
  it("attributes the initial title and description to their author", () => {
    const result = attributeLines([revision(1, "a", "A title", "First line\nSecond line")]);

    expect(result.title.map(({ text, editorMemberId }) => ({ text, editorMemberId }))).toEqual([
      { text: "A title", editorMemberId: "a" },
    ]);
    expect(result.description.map(({ text, editorMemberId }) => ({ text, editorMemberId }))).toEqual([
      { text: "First line", editorMemberId: "a" },
      { text: "Second line", editorMemberId: "a" },
    ]);
  });

  it("carries unchanged lines through inserts and deletes across three revisions", () => {
    const result = attributeLines([
      revision(1, "a", "Title", "Keep\nRemove"),
      revision(2, "b", "Title", "Keep\nAdded\nRemove"),
      revision(3, "a", "Title", "Keep\nAdded\nFinal"),
    ]);

    expect(result.description.map(({ text, editorMemberId }) => ({ text, editorMemberId }))).toEqual([
      { text: "Keep", editorMemberId: "a" },
      { text: "Added", editorMemberId: "b" },
      { text: "Final", editorMemberId: "a" },
    ]);
  });

  it("preserves authorship when a line changes only whitespace", () => {
    const result = attributeLines([
      revision(1, "a", "Title", "A carefully spaced line"),
      revision(2, "b", "Title", "  A   carefully spaced line  "),
    ]);

    expect(result.description).toMatchObject([
      { text: "  A   carefully spaced line  ", editorMemberId: "a", editedAt: "2026-10-21T12:00:00Z" },
    ]);
  });

  it("handles reordered lines deterministically", () => {
    const revisions = [
      revision(1, "a", "Title", "Alpha\nBeta\nGamma"),
      revision(2, "b", "Title", "Beta\nAlpha\nGamma"),
    ];

    expect(attributeLines(revisions)).toEqual(attributeLines([...revisions].reverse()));
    expect(attributeLines(revisions).description.map(({ text, editorMemberId }) => ({ text, editorMemberId }))).toEqual([
      { text: "Beta", editorMemberId: "a" },
      { text: "Alpha", editorMemberId: "b" },
      { text: "Gamma", editorMemberId: "a" },
    ]);
  });

  it("matches repeated identical lines without stealing their authorship", () => {
    const result = attributeLines([
      revision(1, "a", "Title", "Same\nSame"),
      revision(2, "b", "Title", "Same\nNew\nSame"),
    ]);

    expect(result.description.map(({ text, editorMemberId }) => ({ text, editorMemberId }))).toEqual([
      { text: "Same", editorMemberId: "a" },
      { text: "New", editorMemberId: "b" },
      { text: "Same", editorMemberId: "a" },
    ]);
  });

  it("returns empty fields when no revisions are available", () => {
    expect(attributeLines([])).toEqual({ title: [], description: [] });
  });
});
