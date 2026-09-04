import {
  globSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * CLASS guard: nothing in the tree points at OUR code by line number.
 *
 * ⚠ **A `file.ts:123` coordinate cannot survive an edit to the file it names,
 * and it fails silently in the worst way available: the anchor still resolves to
 * a line, just the wrong one.** A reader follows it and takes unrelated code for
 * the evidence of a claim. No linter sees it, no diff sees it — the file holding
 * the anchor was never touched.
 *
 * Measured across the whole tree on 2026-09-03: 83 such anchors outside the
 * skill files. Resolving each against the file it named — 8 landed on an empty
 * line, 3 on a separator or a closing brace, 5 named a file that does not
 * resolve at all, and reading a sample of the remaining 62 put the stale rate
 * near half. Three were wrong about the FILE, not just the line. The skills were
 * worse: six anchors, six stale.
 *
 * They were retired by dropping the coordinate and keeping the NAME, which the
 * surrounding sentence already carried in nearly every case. This table is what
 * holds the result at zero.
 *
 * ⚑ **Third-party references need no allowlist**, because the pattern admits
 * only OUR source extensions. react-router's `dom.js`, Electron's `index.js` and
 * anything else outside `.ts` / `.tsx` / `.mts` is out of scope by construction
 * rather than by a name someone has to maintain.
 *
 * ⚠ **Two exclusions by path, both about artefacts rather than navigation.**
 * `benchmarks/audit-probes/**` holds dated records of past probe runs: an
 * anchor there is evidence of what a file looked like on a given day, and
 * rewriting it falsifies the record. The other is this file's sibling, whose
 * own CONTROL cell plants synthetic anchors as fixture text.
 */
const REPO_ROOT = path.resolve(__dirname, "../../../..");

/** Build output and vendored trees carry no prose of ours. */
const NOT_SOURCE = /node_modules|[/\\]dist[/\\]|coverage|\.turbo|\.stryker/;

/**
 * Dated artefacts, and this file — whose CONTROL cell must contain a real anchor
 * to prove the scan finds one.
 *
 * ⚠ The self-exemption is a BLIND SPOT, and the last cell below is what closes
 * it: every anchor-shaped string here names a file that does not exist, except
 * the two the fixture plants. Its sibling needs no entry — the anchor table
 * moved out of it, and it carries no such string at all. An exemption for a file
 * with nothing to exempt is a blind spot bought for nothing.
 */
const EXEMPT: readonly RegExp[] = [
  /^benchmarks\/audit-probes\//,
  /^packages\/core\/tests\/functional\/line-anchor-authority\.test\.ts$/,
  // ⚠ Its anchor is a SCANNER'S OUTPUT, asserted, not a citation a reader
  // follows: `findAccumulatingCaches` reports `<file>:<line>` and the cell pins
  // that string, so retiring the coordinate would change what the function
  // under test is asserted to return. The last cell below keeps this from being
  // a blind spot by pinning WHICH anchor the file may carry.
  /^packages\/validation-plugin\/tests\/functional\/no-module-level-cache\.test\.ts$/,
];

const SELF = "packages/core/tests/functional/line-anchor-authority.test.ts";

/**
 * A coordinate into one of our source files: `foo.ts:12`, `a/b.tsx:12-30`,
 * `c.mts#L12`, and the comma form `d.ts:12,34-40`.
 *
 * ⚑ **Backticks are optional, and requiring them was a blind spot that held 26
 * live anchors.** The first form of this pattern demanded them, so a prose
 * citation written plainly — `sendCancelIfPossible (Router.ts:512)` — matched
 * nothing and the table stayed green while the coordinate rotted. Measured on
 * 2026-09-04: 26 such anchors in `.ts` comments alone, one of them off by ~400
 * lines since before the branch that found it. The delimiter is a word boundary
 * now; the backtick is consumed when present so the reported anchor keeps its
 * original spelling.
 */
const LINE_ANCHOR =
  /`?\b[A-Za-z0-9_./-]+\.(?:ts|tsx|mts)(?::|#L)\d+(?:[-–,][\d,\-–]*)?`?/g;

interface Anchor {
  file: string;
  anchor: string;
}

function scannedFiles(): string[] {
  return globSync("**/*.{ts,tsx,mts,md}", {
    cwd: REPO_ROOT,
    exclude: (entry) => NOT_SOURCE.test(entry),
  })
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => EXEMPT.every((rule) => !rule.test(file)))
    .toSorted((a, b) => a.localeCompare(b));
}

function lineAnchors(files: readonly string[], root = REPO_ROOT): Anchor[] {
  const rows: Anchor[] = [];

  for (const file of files) {
    let text: string;

    try {
      text = readFileSync(path.resolve(root, file), "utf8");
    } catch {
      continue;
    }

    for (const match of text.matchAll(LINE_ANCHOR)) {
      rows.push({ file, anchor: match[0] });
    }
  }

  return rows.toSorted((a, b) =>
    a.file === b.file
      ? a.anchor.localeCompare(b.anchor)
      : a.file.localeCompare(b.file),
  );
}

/**
 * The anchors that remain: NONE. Every citation names the thing instead.
 *
 * ⚠ Empty is a state, not a property — the cell below it is what makes the
 * emptiness mean something, because `toStrictEqual([])` is satisfied by finding
 * nothing for any reason at all.
 */
const BASELINE: readonly Anchor[] = [];

describe("nothing points at our code by line number", () => {
  it("carries exactly the known line anchors, no more and no fewer", () => {
    expect(lineAnchors(scannedFiles())).toStrictEqual(BASELINE);
  });

  it("CONTROL — the scan FINDS a planted anchor, in prose and in code", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "line-anchor-"));

    try {
      writeFileSync(
        path.join(directory, "a.md"),
        "see `Router.ts:275` and the range `a/b.tsx:7-9`\n",
      );
      writeFileSync(
        path.join(directory, "b.ts"),
        "// the comma form `d.mts:12,34-40` and the hash form `e.ts#L4`\nexport const b = 1;\n",
      );
      // NEGATIVE arm: not our extension, so not our problem to name.
      writeFileSync(
        path.join(directory, "c.md"),
        "react-router's `dom.js:57-71` is cited, not anchored\n",
      );

      expect(lineAnchors(["a.md", "b.ts", "c.md"], directory)).toStrictEqual([
        { file: "a.md", anchor: "`a/b.tsx:7-9`" },
        { file: "a.md", anchor: "`Router.ts:275`" },
        { file: "b.ts", anchor: "`d.mts:12,34-40`" },
        { file: "b.ts", anchor: "`e.ts#L4`" },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — this file's own anchors name invented files, bar the fixture's", () => {
    // The exemption above hides this file from the table, so nothing else would
    // notice a REAL anchor written here. Everything the docblocks and the
    // fixture spell — `foo.ts`, `a/b.tsx`, `c.mts`, `d.mts`, `e.ts` — resolves
    // to nothing; the fixture's `Router.ts` is the one name that exists.
    //
    // ⚠ A SET, not a list, and that is not laziness: this cell's own expectation
    // is itself an anchor-shaped string in this file, so counting occurrences
    // would make the cell red on its own edits. What must not change is WHICH
    // real file is named — `Router.ts`, in both spellings, because the bare one
    // is the historical form of the blind spot and it has to be written out to
    // be pinned.
    const real = new Set(
      globSync("**/*.{ts,tsx,mts}", {
        cwd: REPO_ROOT,
        exclude: (entry) => NOT_SOURCE.test(entry),
      }).map((file) => file.split(path.sep).join("/")),
    );
    const namesARealFile = (anchor: string): boolean => {
      // ⚠ The leading backtick is OPTIONAL since the pattern took the bare form
      // in, and a blind `slice(1)` ate the first letter of every bare anchor —
      // which reported "names no real file" for exactly the spelling the
      // widening was for.
      const spec = anchor.replace(/^`/, "").split(/[:#]/, 1)[0];

      return [...real].some(
        (file) => file === spec || file.endsWith(`/${spec}`),
      );
    };

    const named = new Set(
      lineAnchors([SELF])
        .filter((row) => namesARealFile(row.anchor))
        .map((row) => row.anchor),
    );

    expect([...named].toSorted((a, b) => a.localeCompare(b))).toStrictEqual([
      "`Router.ts:275`",
      "offender.ts:1",
      "Router.ts:512",
    ]);
  });

  it("CONTROL — the scan set reaches prose, tests and the repo root", () => {
    // ⚑ The table above cannot pin its own REACH: a narrower glob finds fewer
    // anchors only where one exists, so with an empty baseline it would stay
    // green while looking at nothing. Measured — the 83 retired anchors lived in
    // markdown, in tests and at the repo root, and NONE in `packages/*/src`,
    // which is the reach the sibling historiography table already has.
    const files = scannedFiles();

    expect(files).toContain("IMPLEMENTATION_NOTES.md");
    expect(files.some((file) => /^packages\/[^/]+\/tests\//.test(file))).toBe(
      true,
    );
    expect(files.some((file) => file.startsWith("examples/"))).toBe(true);
    expect(files.some((file) => file.endsWith(".md"))).toBe(true);
    expect(files.some((file) => /^packages\/[^/]+\/src\//.test(file))).toBe(
      true,
    );
    // …and the dated records stay out of it.
    expect(
      files.some((file) => file.startsWith("benchmarks/audit-probes/")),
    ).toBe(false);
  });

  it("CONTROL — the scanner-output exemption carries exactly the one anchor it is for", () => {
    // The third exemption hides a file that is NOT prose, so nothing else would
    // notice a real citation written there. What it is allowed to carry is one
    // string, and it is machine output rather than a coordinate a reader
    // follows.
    const exempt =
      "packages/validation-plugin/tests/functional/no-module-level-cache.test.ts";

    expect(lineAnchors([exempt]).map((row) => row.anchor)).toStrictEqual([
      "offender.ts:1",
    ]);
  });

  it("CONTROL — the scan finds an anchor written WITHOUT backticks", () => {
    // The historical form of the blind spot this pattern closed: a plain prose
    // citation, in a `.ts` comment, naming a real file. Backticked and bare
    // spellings must both be found, and a version string must not be.
    const directory = mkdtempSync(path.join(tmpdir(), "line-anchor-bare-"));

    try {
      writeFileSync(
        path.join(directory, "d.ts"),
        "// sendCancelIfPossible (Router.ts:512) runs BEFORE sendDispose\n" +
          "// and the backticked form `f.mts:9` beside it\n" +
          "// but node.js:20 is a runtime, not one of ours\n" +
          "export const d = 1;\n",
      );

      expect(lineAnchors(["d.ts"], directory)).toStrictEqual([
        { file: "d.ts", anchor: "`f.mts:9`" },
        { file: "d.ts", anchor: "Router.ts:512" },
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
