// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const html = readFileSync(resolve(root, "index.html"), "utf8");

describe("home-screen app (QA 2026-11-03)", () => {
  it("declares a discreet icon, a manifest and full-screen launch on phones", () => {
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.json"/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
    expect(html).toMatch(/<link rel="icon" href="\/icon\.svg" type="image\/svg\+xml"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/);
    expect(html).toMatch(/<meta name="mobile-web-app-capable" content="yes"/);
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="Ours"/);
    expect(html).toMatch(/<meta name="theme-color" content="#f4eee7"/);
    // Discretion: nothing on the home screen or in the tab says more than "Ours".
    expect(html).not.toMatch(/idea|palette/i);
  });

  it("ships a valid manifest whose icons exist, opening on Ideas", () => {
    const manifest = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "Ours", short_name: "Ours", display: "standalone", start_url: "/ideas" });
    for (const icon of manifest.icons) expect(existsSync(resolve(root, "public", icon.src.replace(/^\//, ""))), icon.src).toBe(true);
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(existsSync(resolve(root, "public/apple-touch-icon.png"))).toBe(true);
    expect(existsSync(resolve(root, "public/icon.svg"))).toBe(true);
  });
});
