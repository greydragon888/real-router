// CLASS guard: a test NAME is a claim, and nothing read it.
//
// #2125 measured the surface: in `packages/*/tests` the names outnumber the
// `⚠`/`⚑` claims in comments by more than an order of magnitude, and the defect
// rate is comparable — so a census of comments there covers a small fraction of
// the claim surface while carrying the name of a full one. A name outlives the
// assertion under it: nothing re-checks it once the file is green.
//
// ⚠ **This is NOT the historiography table widened to names, and that was
// decided on a number.** #2111 measured the phrase list here: 323 accepted
// violations, precision 45 % and 48 %, and 38 self-hits. A phrase list is the
// wrong instrument for a name.
//
// What this reads instead is the one subclass with an ORACLE: a name that
// spells an identifier the codebase does not have. It compares two things in
// the same repository — the name and the code — so it needs no judgement.
// Measured by hand over every hit: 31 of 37 name an API that is absent, 84 %,
// against the 45-48 % that made #2111 reject the phrase list.
//
// ⛔ A second predicate was measured and REJECTED. "The name promises the query
// channel on a file that never builds one" is the shape #2125 proposed seeding
// this with; it draws 12 hits from 492 candidates and nearly all are false —
// the query bag is the THIRD POSITIONAL argument of `navigate`, so a file can
// build one without ever writing `search` or `query`. Separating those needs a
// call graph, and a token is what this file has.

import {
  globSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const PACKAGES_DIR = path.resolve(__dirname, "../../..");

/** Budget for a whole-corpus scan — see `comment-historiography-authority`. */
const CORPUS_SCAN_MS = 120_000;

interface NameRange {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

interface Row {
  file: string;
  token: string;
  count: number;
}

/** The runners whose first argument is a NAME. */
const RUNNERS = new Set(["it", "test", "describe", "bench"]);

/**
 * This file, excluded from its own scan and from the vocabulary.
 *
 * ⚑ **Measured, not assumed: without it the scan returns ZERO.** The baseline
 * below spells every flagged token as a string literal in CODE, so this file
 * would vouch for all of them and the cell would be green over an empty result.
 * #2125 predicted the shape — the phrase list it rejected "failed to self-host
 * with 38 self-hits" — and this predicate fails the same way, harder: not some
 * hits, all of them.
 *
 * ⚠ The exemption is narrow and it is a blind spot: a name in THIS file that
 * spells a missing API is not read by anything.
 */
const SELF = "test-name-authority-2125.test.ts";

function testFiles(): string[] {
  return globSync(`${PACKAGES_DIR}/*/tests/**/*.{ts,tsx}`)
    .filter((file) => !file.endsWith(SELF))
    .toSorted((a, b) => a.localeCompare(b));
}

/** Every identifier the code SPELLS — `routeTreeToDefinitions` does not yield `routeTree`. */
function identifiersOf(source: string): string[] {
  return [...source.matchAll(/\b[A-Za-z_$][\w$]*\b/g)].map((match) => match[0]);
}

/**
 * The names a file declares, with their positions.
 *
 * ⚠ Taken from a PARSE rather than a regex: `it` is an ordinary word too, and
 * the first argument is a name only where a runner is being called.
 */
function namesOf(file: string, source: string): NameRange[] {
  const parsed = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: NameRange[] = [];

  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      let head: ts.Expression = node.expression;

      while (ts.isPropertyAccessExpression(head) || ts.isCallExpression(head)) {
        head = head.expression;
      }

      const argument = node.arguments[0];

      if (
        ts.isIdentifier(head) &&
        RUNNERS.has(head.text) &&
        ts.isStringLiteralLike(argument)
      ) {
        found.push({
          text: argument.text,
          start: argument.getStart(parsed),
          end: argument.getEnd(),
        });
      }
    }

    ts.forEachChild(node, walk);
  };

  walk(parsed);

  return found;
}

/** The file with every test name blanked, so a name cannot vouch for itself. */
function codeOnly(source: string, names: readonly NameRange[]): string {
  const ordered = [...names].toSorted((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;

  for (const name of ordered) {
    out += source.slice(cursor, name.start) + " ".repeat(name.end - name.start);
    cursor = name.end;
  }

  return out + source.slice(cursor);
}

let knownCache: Set<string> | undefined;

/**
 * Every identifier the repository spells, with the test NAMES excised.
 *
 * ⚑ **The excision is the whole predicate, and omitting it is silently
 * vacuous.** A name lives inside a file this corpus reads, so without blanking
 * it every token in every name is "known" by construction and the scan returns
 * ZERO — green, and measuring nothing. That is not hypothetical: the first run
 * of this predicate reported no hits for exactly that reason. The cell below
 * plants the same mistake and requires it to red.
 */
function known(): Set<string> {
  if (knownCache) {
    return knownCache;
  }

  const files = [
    ...globSync(`${PACKAGES_DIR}/*/src/**/*.{ts,tsx,svelte}`),
    ...globSync(`${REPO_ROOT}/shared/**/*.ts`),
    ...testFiles(),
  ];
  const identifiers = new Set<string>();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const code = file.includes(`${path.sep}tests${path.sep}`)
      ? codeOnly(source, namesOf(file, source))
      : source;

    for (const identifier of identifiersOf(code)) {
      identifiers.add(identifier);
    }
  }

  knownCache = identifiers;

  return identifiers;
}

/** camelCase: lower start, at least one inner capital. A `TitleCase` type is not one. */
const CAMEL = /\b[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+\b/g;

/**
 * The camelCase tokens in a name that the codebase does not spell.
 *
 * ⚠ A token standing where an ARGUMENT stands is prose describing a shape, not
 * a promise of an API — `subscribeLeave(nonFunction)`, `start(samePath)`,
 * `startsWithSegment(name, firstSegment)`, `|outputTokens|`. Measured: the
 * exclusion drops five hits, and every one of them was a false positive.
 */
function unknownTokens(
  name: string,
  vocabulary: ReadonlySet<string>,
): string[] {
  const out: string[] = [];

  for (const match of name.matchAll(CAMEL)) {
    const token = match[0];

    if (vocabulary.has(token)) {
      continue;
    }

    const index = match.index;
    const before = name.slice(Math.max(0, index - 2), index);
    const after = name.slice(index + token.length, index + token.length + 1);
    const isArgument = /[(,]\s?$/.test(before) && /[),]/.test(after);

    if (isArgument || before.endsWith("|") || after === "|") {
      continue;
    }

    out.push(token);
  }

  return out;
}

function scanNames(
  files: readonly string[],
  vocabulary: ReadonlySet<string>,
): Row[] {
  const rows = new Map<string, Row>();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const relative = path.relative(REPO_ROOT, file);

    for (const name of namesOf(file, source)) {
      for (const token of unknownTokens(name.text, vocabulary)) {
        const key = `${relative}|${token}`;
        const row = rows.get(key);

        if (row) {
          row.count++;
        } else {
          rows.set(key, { file: relative, token, count: 1 });
        }
      }
    }
  }

  return [...rows.values()].toSorted((a, b) =>
    a.file === b.file
      ? a.token.localeCompare(b.token)
      : a.file.localeCompare(b.file),
  );
}

/**
 * The names standing today that spell something the code does not have.
 *
 * ⚑ A SET, compared with `toStrictEqual`, never a threshold: a rename that
 * drops one bad name and adds another must red, and a count cannot see that.
 *
 * ⚠ Six rows are prose rather than a promise — `kN`, `fullCompare`,
 * `effectiveMax`, `routeUtils`, `preventDefaults`, `protoKey`. They are what a
 * baseline is for. The rest name a module, option or export that does not
 * exist: `core/routes/routeTree/…` is a layer folded into `engine` (#1510),
 * `autoCleanUp` is an option no source spells, and `createRouteSources` is the
 * plural of an export that is singular.
 */
const NAME_BASELINE: readonly Row[] = [
  {
    file: "packages/angular/tests/property/scrollRestoration.properties.ts",
    token: "kN",
    count: 1,
  },
  {
    file: "packages/core/tests/benchmarks/default.bench.ts",
    token: "fullCompare",
    count: 1,
  },
  {
    file: "packages/core/tests/engine/property/queryParams.properties.ts",
    token: "getQueryParamsMeta",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/api/getLifecycleApi/removeGuard.test.ts",
    token: "removeGuard",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/api/getRoutesApi/getRoute.test.ts",
    token: "routeTree",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/api/getRoutesApi/getRouteConfig.test.ts",
    token: "routeTree",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/api/getRoutesApi/hasRoute.test.ts",
    token: "routeTree",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/api/getRoutesApi/updateRoute.test.ts",
    token: "routeTree",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/navigation/navigate/auto-cleanup.test.ts",
    token: "autoCleanUp",
    count: 3,
  },
  {
    file: "packages/core/tests/functional/navigation/navigate/promise-reject.test.ts",
    token: "processLifecycleResult",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/routerLifecycle/dispose.test.ts",
    token: "guardAgainstDisposed",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/routes/buildPath.test.ts",
    token: "buildOptions",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/routes/isActiveRoute.test.ts",
    token: "routeQuery",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/state.test.ts",
    token: "stateBuilder",
    count: 1,
  },
  {
    file: "packages/core/tests/functional/transitionPath.test.ts",
    token: "fromMeta",
    count: 1,
  },
  {
    file: "packages/memory-plugin/tests/property/memoryPlugin.properties.ts",
    token: "backN",
    count: 1,
  },
  {
    file: "packages/memory-plugin/tests/property/memoryPlugin.properties.ts",
    token: "effectiveMax",
    count: 1,
  },
  {
    file: "packages/preact/tests/functional/Link.test.tsx",
    token: "clickHandler",
    count: 1,
  },
  {
    file: "packages/preact/tests/stress/should-update-cache.stress.tsx",
    token: "shouldUpdateCache",
    count: 1,
  },
  {
    file: "packages/react/tests/functional/Link.test.tsx",
    token: "clickHandler",
    count: 1,
  },
  {
    file: "packages/react/tests/stress/should-update-cache.stress.tsx",
    token: "shouldUpdateCache",
    count: 1,
  },
  {
    file: "packages/route-utils/tests/property/routeUtils.properties.ts",
    token: "routeUtils",
    count: 1,
  },
  {
    file: "packages/rsc-server-plugin/tests/stress/rsc-action.stress.ts",
    token: "rscServer",
    count: 1,
  },
  {
    file: "packages/solid/tests/functional/Link.test.tsx",
    token: "clickHandler",
    count: 1,
  },
  {
    file: "packages/solid/tests/stress/should-update-cache.stress.tsx",
    token: "shouldUpdateCache",
    count: 1,
  },
  {
    file: "packages/sources/tests/stress/should-update-cache-growth.stress.ts",
    token: "shouldUpdateCache",
    count: 1,
  },
  {
    file: "packages/sources/tests/unit/createActiveRouteStore.test.ts",
    token: "createActiveRouteSources",
    count: 1,
  },
  {
    file: "packages/sources/tests/unit/createRouteNodeStore.test.ts",
    token: "createRouteNodeSources",
    count: 1,
  },
  {
    file: "packages/sources/tests/unit/createRouteStore.test.ts",
    token: "createRouteSources",
    count: 1,
  },
  {
    file: "packages/svelte/tests/functional/Link.test.ts",
    token: "clickHandler",
    count: 1,
  },
  {
    file: "packages/svelte/tests/stress/should-update-cache.stress.ts",
    token: "shouldUpdateCache",
    count: 1,
  },
  {
    file: "packages/vue/tests/functional/Link.test.ts",
    token: "clickHandler",
    count: 1,
  },
  {
    file: "packages/vue/tests/functional/Link.test.ts",
    token: "preventDefaults",
    count: 1,
  },
  {
    file: "packages/vue/tests/property/shallowEqual.properties.ts",
    token: "protoKey",
    count: 1,
  },
  {
    file: "packages/vue/tests/stress/should-update-cache.stress.ts",
    token: "shouldUpdateCache",
    count: 1,
  },
];

describe("a test NAME spells something the code has (#2125)", () => {
  it(
    "carries exactly the known unknown-identifier names, no more and no fewer",
    () => {
      expect(scanNames(testFiles(), known())).toStrictEqual(NAME_BASELINE);
    },
    CORPUS_SCAN_MS,
  );

  it(
    "reports the denominator, because a hit count without one says nothing",
    () => {
      const names = testFiles().reduce(
        (sum, file) => sum + namesOf(file, readFileSync(file, "utf8")).length,
        0,
      );

      // ⚠ A FLOOR, not a census. The corpus grows, and pinning its size would
      // make every added test red this cell. What it guards is that the
      // extractor still SEES names — a parse that started returning nothing
      // would otherwise report a clean corpus.
      expect(names).toBeGreaterThan(10_000);
    },
    CORPUS_SCAN_MS,
  );

  it("CONTROL — the name excision is load-bearing, not tidiness", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "names-"));

    try {
      const file = path.join(directory, "a.test.ts");

      writeFileSync(file, 'it("exercises noSuchApiHere", () => {});\n');

      const source = readFileSync(file, "utf8");
      const names = namesOf(file, source);

      // With the name blanked, the token is unknown and the scan finds it.
      expect(
        unknownTokens(
          names[0].text,
          new Set(identifiersOf(codeOnly(source, names))),
        ),
      ).toStrictEqual(["noSuchApiHere"]);

      // Without it, the name vouches for itself and the scan is VACUOUS.
      expect(
        unknownTokens(names[0].text, new Set(identifiersOf(source))),
      ).toStrictEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("CONTROL — a name is judged against the code, and prose is not an API", () => {
    const vocabulary = new Set(["realIdentifier"]);

    expect(unknownTokens("uses realIdentifier here", vocabulary)).toStrictEqual(
      [],
    );
    expect(unknownTokens("uses madeUpThing here", vocabulary)).toStrictEqual([
      "madeUpThing",
    ]);

    // Argument position is prose about a shape, not a promise.
    expect(
      unknownTokens(
        "subscribeLeave(nonFunction) throws",
        new Set(["realIdentifier", "subscribeLeave"]),
      ),
    ).toStrictEqual([]);
    expect(
      unknownTokens("conservation: |outputTokens| is bounded", vocabulary),
    ).toStrictEqual([]);

    // A TitleCase type is not a camelCase identifier, and neither is a word.
    expect(
      unknownTokens("RouterError carries a field", vocabulary),
    ).toStrictEqual([]);
    expect(
      unknownTokens("returns true for a missing route", vocabulary),
    ).toStrictEqual([]);
  });

  it("CONTROL — the extractor reads a NAME, not every string", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "names-"));

    try {
      const file = path.join(directory, "b.test.ts");

      writeFileSync(
        file,
        [
          'const label = "notAName";',
          'describe("outerName", () => {',
          '  it("innerName here", () => {});',
          '  expect(x).toBe("alsoNotAName");',
          "});",
          "",
        ].join("\n"),
      );

      expect(
        namesOf(file, readFileSync(file, "utf8")).map((name) => name.text),
      ).toStrictEqual(["outerName", "innerName here"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
