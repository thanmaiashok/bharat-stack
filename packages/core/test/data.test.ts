import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dataDir = join(import.meta.dirname, "..", "data");
const files = readdirSync(dataDir).filter((f) => f.endsWith(".json"));

describe("data files", () => {
  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s: every entry is sourced and dated", (file) => {
    const doc = JSON.parse(readFileSync(join(dataDir, file), "utf8"));
    expect(doc.dataset).toEqual(expect.any(String));
    expect(doc.version).toMatch(/^\d{4}\.\d+\.\d+$/);
    expect(Array.isArray(doc.entries)).toBe(true);
    for (const e of doc.entries) {
      expect(e.source, JSON.stringify(e)).toMatch(/^https:\/\//);
      expect(e.last_verified, JSON.stringify(e)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["official", "secondary"]).toContain(e.verification);
    }
  });
});
