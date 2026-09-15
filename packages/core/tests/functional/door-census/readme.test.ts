import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Does the README still describe this folder? (#2303)
 *
 * ⚑ The folder argues that a written inventory without an oracle rots in
 * silence. Its README is a written inventory, and this file is its oracle —
 * without it the argument applies to the document making it, and a reader
 * finds that out by checking rather than by a failing test.
 *
 * ⚠ It checks what a document can be WRONG about, not what it argues. The
 * definition of a door, the reason a total is a union, the account of the
 * artefact that rotted — those are prose and stay unchecked. Names, counts of
 * files, and the existence of every authority the README sends a reader to are
 * facts, and a fact in a document is a promise to re-measure it.
 */
describe("the door-census README (#2303)", () => {
  const HERE = __dirname;
  const ROOT = path.resolve(HERE, "../../../../..");

  const README = readFileSync(path.join(HERE, "README.md"), "utf8");

  const byName = (a: string, b: string): number => a.localeCompare(b);

  const testFiles = (): string[] =>
    globSync("*.test.ts", { cwd: HERE }).toSorted(byName);

  it("the table lists exactly the tests that are here", () => {
    // Rows are spelled `| `name.test.ts` |` in the first column.
    const listed = [...README.matchAll(/^\|\s*`([\w-]+\.test\.ts)`/gm)]
      .map((m) => m[1])
      .toSorted(byName);

    // ⚠ Anti-vacuum: a table that stopped being recognised would agree with an
    // empty folder, and both halves would read as "nothing to see".
    expect(listed.length).toBeGreaterThan(5);

    expect(listed).toStrictEqual(testFiles());
  });

  it("the repo-wide claim names exactly the registered scans", () => {
    const registry = JSON.parse(
      readFileSync(path.join(ROOT, "scripts/repo-wide-scans.json"), "utf8"),
    ) as { scans: { file: string }[] };

    const registered = registry.scans
      .filter((s) => s.file.includes("/door-census/"))
      .map((s) => path.basename(s.file).replace(/\.test\.ts$/, ""))
      .toSorted(byName);

    const heading = /^## (\w+) of these are repo-wide scans$/m.exec(README);

    expect(heading, "the heading still states a count").not.toBeNull();

    const WORDS: Record<string, number> = {
      Two: 2,
      Three: 3,
      Four: 4,
      Five: 5,
      Six: 6,
      Seven: 7,
      Eight: 8,
    };

    expect(WORDS[heading![1]]).toBe(registered.length);

    // ⚑ Naming the wrong ones is the half a count cannot catch, so the SET is
    // read out of the sentence that makes the claim — everything before the
    // verb — rather than out of the whole paragraph, where the two that stay
    // home are named too.
    const paragraph = README.slice(heading!.index).split("\n\n", 2)[1] ?? "";
    const claim = /^([\S\s]*?)\bread\s+beyond\b/.exec(paragraph)?.[1] ?? "";

    const claimed = [...claim.matchAll(/`([\w-]+)`/g)]
      .map((m) => m[1])
      .toSorted(byName);

    expect(claimed).toStrictEqual(registered);
  });

  it("every authority the README sends a reader to exists", () => {
    // ⚑ The two axes this folder does not own are named by FILE, which is what
    // makes the hand-off checkable: a renamed or deleted authority turns the
    // paragraph into a dead pointer, and #2130 established that an exemption
    // naming a test must be conditioned on that test existing.
    const named = [...README.matchAll(/`([a-z][\w-]*-(?:authority|\d{4}))`/g)]
      .map((m) => m[1])
      .filter((n) => n !== "repo-scan-authority-2241");

    expect(named.length).toBeGreaterThan(12);

    const missing = [...new Set(named)].filter(
      (name) =>
        !existsSync(
          path.join(ROOT, `packages/core/tests/functional/${name}.test.ts`),
        ) &&
        !existsSync(
          path.join(
            ROOT,
            `packages/validation-plugin/tests/functional/${name}.test.ts`,
          ),
        ),
    );

    expect(missing.toSorted(byName)).toStrictEqual([]);
  });
});
