import { describe, expect, it } from "vitest";
import { importRequestId, parseImport, summarize } from "./import.mjs";

describe("parseImport", () => {
  it("splits entries on blank lines: first line is the title, the rest the description", () => {
    const text = "Synthetic one\nA synthetic description.\nSecond line.\n\n\nSynthetic two\nMore synthetic text.\n";
    expect(parseImport(text)).toEqual({
      entries: [
        { title: "Synthetic one", description: "A synthetic description.\nSecond line." },
        { title: "Synthetic two", description: "More synthetic text." },
      ],
      problems: [],
    });
  });

  it("uses the title as the description when there is none, and strips list markers", () => {
    expect(parseImport("- Synthetic bullet\n\n2. Synthetic numbered\n\n* Synthetic star").entries).toEqual([
      { title: "Synthetic bullet", description: "Synthetic bullet" },
      { title: "Synthetic numbered", description: "Synthetic numbered" },
      { title: "Synthetic star", description: "Synthetic star" },
    ]);
  });

  it("handles Windows line endings and surrounding whitespace", () => {
    expect(parseImport("  Synthetic CRLF  \r\n  body  \r\n\r\n").entries).toEqual([{ title: "Synthetic CRLF", description: "body" }]);
  });

  it("reports entries that would break the database limits, by number only", () => {
    const longTitle = "x".repeat(121);
    const longBody = "y".repeat(4001);
    const { entries, problems } = parseImport(`${longTitle}\n\nOk\n${longBody}\n\nFine`);
    expect(entries).toEqual([{ title: "Fine", description: "Fine" }]);
    expect(problems).toEqual(["entry 1: title is over 120 characters", "entry 2: description is over 4000 characters"]);
  });

  it("finds nothing in an empty file", () => {
    expect(parseImport("\n \n")).toEqual({ entries: [], problems: [] });
  });
});

describe("importRequestId", () => {
  it("is a stable UUID per entry, so a re-run creates nothing twice", () => {
    const a = importRequestId({ title: "Synthetic", description: "Synthetic body" });
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(importRequestId({ title: "Synthetic", description: "Synthetic body" })).toBe(a);
    expect(importRequestId({ title: "Synthetic", description: "Other body" })).not.toBe(a);
  });
});

describe("summarize", () => {
  it("describes a file without echoing any of its content", () => {
    const out = summarize(parseImport("Synthetic secret title\nSynthetic secret body\n\nSynthetic other"));
    expect(out).toBe("2 ideas ready to import, 0 skipped.");
    expect(out).not.toMatch(/secret|Synthetic/);
  });
});

describe("parseImportJson", () => {
  it("reads entries with sharing, the partner's answer, comments and Later", async () => {
    const { parseImportJson } = await import("./import.mjs");
    const text = JSON.stringify({
      entries: [
        { title: "Synthetic agreed", description: "Synthetic body", share: true, partner: "in" },
        { title: "Synthetic pending", description: "Synthetic body", share: true },
        {
          title: "Synthetic talked",
          description: "Synthetic body",
          share: true,
          partner: "in",
          comments: [
            { by: "partner", body: "Synthetic question" },
            { by: "author", body: "Synthetic answer" },
          ],
          later: { by: "partner" },
        },
        { title: "Synthetic draft", description: "Synthetic body" },
      ],
    });
    const { entries, problems } = parseImportJson(text);
    expect(problems).toEqual([]);
    expect(entries.map((entry) => [entry.share, entry.partner, entry.comments.length, entry.later?.by ?? null])).toEqual([
      [true, "in", 0, null],
      [true, null, 0, null],
      [true, "in", 2, "partner"],
      [false, null, 0, null],
    ]);
  });

  it("skips entries that can't be imported, by number, without echoing them", async () => {
    const { parseImportJson } = await import("./import.mjs");
    const { entries, problems } = parseImportJson(
      JSON.stringify({
        entries: [
          { title: "", description: "x" },
          { title: "Synthetic", description: "x", partner: "in" },
          { title: "Synthetic", description: "x", share: true, comments: [{ by: "someone", body: "x" }] },
          { title: "Synthetic ok", description: "x", share: true },
        ],
      }),
    );
    expect(entries).toHaveLength(1);
    expect(problems).toEqual([
      "entry 1: title is empty",
      "entry 2: a partner answer or comments need share: true",
      "entry 3: comments need by: author or partner, and a body",
    ]);
  });

  it("rejects a file that isn't the expected JSON", async () => {
    const { parseImportJson } = await import("./import.mjs");
    expect(parseImportJson("not json").problems).toEqual(["the file is not valid JSON"]);
    expect(parseImportJson("{}").problems).toEqual(["the file needs an entries list"]);
  });
});
