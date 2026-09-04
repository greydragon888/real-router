import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * What depends on the `buildPath` interception point, enumerated (#2090).
 *
 * `seam-coverage-authority-1938` pins which seam each DOOR runs — production
 * behaviour. This is the other question: which tests stand on that seam
 * EXISTING, so retiring it can be decomposed into steps that each have their own
 * green. A count cannot be decomposed; it does not say which cell belongs to
 * which step, and every count taken of this seam so far has gone stale — #2090
 * owns that record.
 *
 * ⚑ **Two arms, two units, and the difference is not cosmetic.**
 *
 * - **NAMING** — a site calling `addInterceptor("buildPath")`. The unit is the
 *   CELL: a step rewrites or deletes cells one at a time. Keyed `file::cell`.
 * - **TRANSITIVE** — a file installing a plugin that registers there. The unit is
 *   the FILE: every cell in such a suite rides the seam through the plugin, so a
 *   step moves the plugin and the whole file follows. Nothing in these files
 *   names `buildPath`, and since #2088 an unknown seam name THROWS at
 *   `usePlugin` rather than registering a silent no-op — they break loudly on a
 *   retirement, and no scan for the string sees them coming.
 *
 * ⚑ **The KEYS are derived; the VERDICTS are authored.** The walk produces the
 * key sets from the AST, so a new site appears as an unclassified key and reds.
 * What a row should BECOME is judgement, and a wrong verdict is caught by a
 * reader rather than by this file. The ratchet is on the set.
 *
 * ⚠ Structure, not text: the key is `file::cell`, so renaming a LOCAL inside a
 * cell cannot move one, while retitling the cell deliberately does. What the
 * predicate reads is a member call with the receiver present and both names
 * LITERAL in the source; hide either name behind a binding or a computed value
 * and the site is ABSENT rather than reported. The CONTROL cell asserts that
 * boundary in both polarities instead of it being described here.
 *
 * ⚠ The transitive arm derives its SEEDS from the same walk: the packages that
 * register on the seam from their own `src`. A second plugin registering there
 * is picked up without editing the predicate. Its two blind spots are measured
 * rather than assumed, and both are handled — the factory reaches `usePlugin` as
 * a NON-FIRST argument in the cross-router app, and part of the plugin's own
 * suite imports it by relative path rather than by package name.
 */

const PACKAGES = path.resolve(__dirname, "../../..");
const REPO = path.resolve(PACKAGES, "..");
const BENCHMARKS = path.resolve(REPO, "benchmarks");

type Verdict =
  | "delete"
  | "rewrite onto the new seam"
  | "already covered by seam-coverage"
  | "untouched";

const repoPath = (file: string): string =>
  path.relative(REPO, file).split(path.sep).join("/");

const sourceOf = (file: string, code: string): ts.SourceFile =>
  ts.createSourceFile(file, code, ts.ScriptTarget.ESNext, true);

/** The called member's name, however the call spells it. */
const calledMember = (callee: ts.Expression): string | undefined => {
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }

  if (
    ts.isElementAccessExpression(callee) &&
    ts.isStringLiteralLike(callee.argumentExpression)
  ) {
    return callee.argumentExpression.text;
  }

  return undefined;
};

/**
 * The census predicate. One copy, because the CONTROL cell probes THIS function
 * rather than a restatement of it that could drift from it.
 */
const registersBuildPath = (node: ts.Node): boolean =>
  ts.isCallExpression(node) &&
  calledMember(node.expression) === "addInterceptor" &&
  node.arguments.length > 0 &&
  ts.isStringLiteralLike(node.arguments[0]) &&
  node.arguments[0].text === "buildPath";

/** The nearest enclosing `it` / `test` / `describe` title, or module scope. */
const enclosing = (node: ts.Node): string => {
  let n: ts.Node | undefined = node;

  while (n) {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      ["it", "test", "describe"].includes(n.expression.text) &&
      n.arguments.length > 0 &&
      ts.isStringLiteralLike(n.arguments[0])
    ) {
      return n.arguments[0].text;
    }

    n = n.parent;
  }

  return "(module scope)";
};

const sourceFiles = (): string[] =>
  [
    ...globSync(`${PACKAGES}/*/src/**/*.{ts,tsx,mts}`),
    ...globSync(`${PACKAGES}/*/tests/**/*.{ts,tsx,mts}`),
    ...globSync(`${BENCHMARKS}/**/*.{ts,tsx,mts,mjs}`),
  ].filter((f) => !/node_modules|[/\\](dist|coverage)[/\\]/.test(f));

/** Arm A, and the seeds arm B needs. */
const namingSites = (): { keys: string[]; seeds: Set<string> } => {
  const keys = new Set<string>();
  const seeds = new Set<string>();

  for (const file of sourceFiles()) {
    const code = readFileSync(file, "utf8");

    if (!code.includes("addInterceptor")) {
      continue;
    }

    const label = repoPath(file);

    const visit = (node: ts.Node): void => {
      if (registersBuildPath(node)) {
        keys.add(`${label}::${enclosing(node)}`);

        const owner = /^packages\/([^/]+)\/src\//.exec(label);

        if (owner) {
          seeds.add(owner[1]);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceOf(file, code));
  }

  return { keys: [...keys].toSorted((a, b) => a.localeCompare(b)), seeds };
};

/**
 * `usePlugin(factory(...))`, `usePlugin(a, factory(...))` and `usePlugin(f)` all
 * reduce to the identifier the call hangs off.
 */
const calleeRoot = (node: ts.Expression): string => {
  if (ts.isCallExpression(node)) {
    return calleeRoot(node.expression);
  }

  if (ts.isIdentifier(node)) {
    return node.text;
  }

  return "";
};

/** Names imported from a seam-registering package, by name or by relative path. */
const seedBindings = (
  source: ts.SourceFile,
  seeds: ReadonlySet<string>,
  local: boolean,
): Set<string> => {
  const bindings = new Set<string>();

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    const spec = statement.moduleSpecifier.getText(source);

    const byPackageName = [...seeds].some((seed) => spec.includes(seed));
    const byRelativePath = local && spec.startsWith('"..');

    if (!byPackageName && !byRelativePath) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      bindings.add(element.name.text);
    }
  }

  return bindings;
};

/** Arm B — files that install one of the seeded packages. */
const transitiveFiles = (seeds: ReadonlySet<string>): string[] => {
  const files = new Set<string>();

  for (const file of sourceFiles()) {
    const label = repoPath(file);
    const code = readFileSync(file, "utf8");
    const owner = /^packages\/([^/]+)\//.exec(label)?.[1];
    const byName = [...seeds].some((s) => code.includes(`@real-router/${s}`));
    const byPath = owner !== undefined && seeds.has(owner);

    if (!byName && !byPath) {
      continue;
    }
    if (/^packages\/[^/]+\/src\//.test(label)) {
      continue;
    }

    const source = sourceOf(file, code);
    const bindings = seedBindings(source, seeds, byPath);

    if (bindings.size === 0) {
      continue;
    }

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "usePlugin" &&
        node.arguments.some((a) => bindings.has(calleeRoot(a)))
      ) {
        files.add(label);
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return [...files].toSorted((a, b) => a.localeCompare(b));
};

const CORE = "packages/core/tests";
const ADD_BP = `${CORE}/functional/api/getPluginApi/addBuildPathInterceptor.test.ts`;
const GUARD_MUTANTS = `${CORE}/functional/api/getPluginApi/invariantGuardMutants.test.ts`;
const HREF_2087 = `${CORE}/functional/href-equals-destination-with-plugin-2087.test.ts`;
const LIVENESS = `${CORE}/functional/interceptor-channel-liveness-1928.test.ts`;
const MATCH_PATH = `${CORE}/functional/matchPathInterceptors.test.ts`;
const QUERY_PARAMS = `${CORE}/functional/navigation/navigate/query-params.test.ts`;
const PRE_START = `${CORE}/functional/navigation/pre-start-window-1610.test.ts`;
const PROBES = "benchmarks/audit-probes";
const PP = "packages/persistent-params-plugin";

/**
 * ⚑ `delete` is for cells whose SUBJECT is the interceptable — they have nothing
 * to say once it is gone. `rewrite onto the new seam` is for cells that use it as
 * a vehicle for something else, which survives under another name.
 *
 * `untouched` is the audit probes: date-stamped snapshots that no task runs, so a
 * retirement leaves them as they are rather than migrating them.
 */
const NAMING: Readonly<Record<string, Verdict>> = {
  [`${PROBES}/use-plugin-2026-06-25/probe-01-plugin-contracts.ts::(module scope)`]:
    "untouched",
  [`${PROBES}/use-plugin-2026-06-25/probe-02-interceptor-onion-latency.ts::(module scope)`]:
    "untouched",
  [`${PROBES}/use-plugin-2026-07-03/probe-01-wave2-contracts.ts::(module scope)`]:
    "untouched",
  "packages/browser-plugin/tests/functional/replace-history-state-agreement.test.ts::builds the path ONCE per call, not three times":
    "rewrite onto the new seam",
  [`${ADD_BP}::correctly removes interceptor from pipeline`]: "delete",
  [`${ADD_BP}::defaults the params bag when an interceptor drops it`]: "delete",
  [`${ADD_BP}::double unsubscribe does NOT remove a duplicate registration of the same fn (#1198)`]:
    "delete",
  [`${ADD_BP}::double unsubscribe is a no-op`]: "delete",
  [`${ADD_BP}::interceptor is NOT called after unsubscribe`]: "delete",
  [`${ADD_BP}::refuses a non-function interceptor, even under a REAL method name`]:
    "rewrite onto the new seam",
  [`${ADD_BP}::skips the original buildPath when the interceptor never calls next()`]:
    "delete",
  [`${ADD_BP}::throws ROUTER_DISPOSED on disposed router`]:
    "rewrite onto the new seam",
  [`${ADD_BP}::transforms params in buildPath() inside navigate() — state.path reflects intercepted params`]:
    "delete",
  [`${ADD_BP}::transforms params in facade buildPath() calls`]: "delete",
  [`${ADD_BP}::two interceptors compose — last-added is outermost`]:
    "rewrite onto the new seam",
  [`${GUARD_MUTANTS}::a stale unsubscribe must NOT remove a sibling interceptor`]:
    "rewrite onto the new seam",
  [`${GUARD_MUTANTS}::unsubscribing a non-first interceptor removes the correct one`]:
    "rewrite onto the new seam",
  [`${HREF_2087}::href equals destination with a plugin injecting (#2087)`]:
    "rewrite onto the new seam",
  [`${HREF_2087}::the ⑤a executor sees ONE params shape, \`UNKNOWN_ROUTE\` included`]:
    "delete",
  [`${LIVENESS}::(module scope)`]: "rewrite onto the new seam",
  [`${LIVENESS}::REPORTS the key the chain added, once a validator is listening`]:
    "rewrite onto the new seam",
  [`${LIVENESS}::covers all FOUR producers the issue enumerates, not just navigate`]:
    "rewrite onto the new seam",
  [`${LIVENESS}::does not let an interceptor write reach the committed state unseen`]:
    "rewrite onto the new seam",
  [`${MATCH_PATH}::does NOT apply buildPath interceptors (matchedState.path bypasses the interceptor pipeline)`]:
    "already covered by seam-coverage",
  [`${MATCH_PATH}::router.navigate (post-matchPath) goes through ctx.buildPath — interceptor runs there`]:
    "already covered by seam-coverage",
  [`${QUERY_PARAMS}::CORE OWNERSHIP: buildPath facade normalizes user input at API boundary`]:
    "rewrite onto the new seam",
  [`${QUERY_PARAMS}::CORE OWNERSHIP: normalizes params before they reach the query engine`]:
    "rewrite onto the new seam",
  [`${PRE_START}::refuses a nested navigate() driven from a buildPath interceptor`]:
    "rewrite onto the new seam",
  [`${PRE_START}::still allows a navigation from matchPath's interceptors — a query prepares nothing`]:
    "rewrite onto the new seam",
  [`${CORE}/functional/routerLifecycle/dispose.test.ts::dispose() clears ctx.interceptors so a leaked interceptor no longer runs (#1199)`]:
    "rewrite onto the new seam",
  [`${CORE}/functional/seam-coverage-authority-1938.test.ts::which seam each door runs (#1938)`]:
    "already covered by seam-coverage",
  [`${CORE}/property/committedState.properties.ts::Committed state is owned by the navigation in flight`]:
    "rewrite onto the new seam",
  [`${CORE}/property/pluginApi.properties.ts::addInterceptor on disposed router throws`]:
    "rewrite onto the new seam",
  [`${CORE}/property/pluginApi.properties.ts::multiple interceptors execute in LIFO order`]:
    "rewrite onto the new seam",
  [`${CORE}/property/pluginApi.properties.ts::pluginApi.addInterceptor Properties`]:
    "rewrite onto the new seam",
  [`${CORE}/property/pluginApi.properties.ts::unsubscribe removes interceptor`]:
    "rewrite onto the new seam",
  [`${CORE}/property/searchPathConsistency.properties.ts::core/state — href equals destination with an injector (#2087)`]:
    "rewrite onto the new seam",
};

/**
 * ⚑ Two files the transitive walk MUST reach, given a seed — one per blind spot
 * the arm was built around. `plugin.test.ts` imports the plugin by RELATIVE
 * path rather than by package name; the cross-router app hands the factory to
 * `usePlugin` as a NON-FIRST argument. They are the control's targets, not a
 * census: with no plugin registering on the seam, the arm itself is empty.
 */
const TRANSITIVE_CONTROL_TARGETS: readonly string[] = [
  "benchmarks/cross-router/apps/react/real-router-full/src/main.tsx",
  `${PP}/tests/functional/plugin.test.ts`,
];

describe("what depends on the buildPath interception point (#2090)", () => {
  const { keys, seeds } = namingSites();

  it("the NAMING arm — every site, classified", () => {
    expect(keys).toStrictEqual(
      Object.keys(NAMING).toSorted((a, b) => a.localeCompare(b)),
    );
  });

  it("the TRANSITIVE arm — empty, because no plugin registers on the seam", () => {
    expect([...seeds]).toStrictEqual([]);
    expect(transitiveFiles(seeds)).toStrictEqual([]);
  });

  it("CONTROL — a seed still produces a non-empty transitive answer", () => {
    // `[]` above is an answer only if a seed produces something. A plugin that
    // no longer registers on the seam is still a real package with real
    // importers, so it drives the walk without asserting anything about the
    // seam. A second plugin registering there would widen the arm without a
    // predicate change — this is what keeps that true.
    const reached = transitiveFiles(new Set(["persistent-params-plugin"]));

    for (const target of TRANSITIVE_CONTROL_TARGETS) {
      expect(reached).toContain(target);
    }
  });

  it("CONTROL — the predicate is structural: a local rename cannot move a key", () => {
    const hits = (code: string): number => {
      let n = 0;
      const visit = (node: ts.Node): void => {
        if (registersBuildPath(node)) {
          n += 1;
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceOf("probe.ts", code));

      return n;
    };

    const before = `api.addInterceptor("buildPath", (next, route, params) => next(route, params));`;
    const after = `api.addInterceptor("buildPath", (onward, name, bag) => onward(name, bag));`;

    // POSITIVE control first: the walk must see the site at all, or the
    // equality below is two zeros agreeing.
    expect(hits(before)).toBe(1);
    expect(hits(after)).toBe(hits(before));

    // Reach, in both polarities. Either spelling of the member call counts.
    expect(hits(`api["addInterceptor"]("buildPath", fn);`)).toBe(1);
    expect(hits(`api.addInterceptor("forwardState", fn);`)).toBe(0);

    // ⚠ The boundary, pinned rather than left to a reader: a name that is not
    // literal at the call makes the site ABSENT from the census rather than
    // reported. Two instances, so the cell shows the rule and not one case.
    // Nothing in the tree spells it either way today, and resolving bindings
    // would buy nothing until something does.
    expect(
      hits(`const { addInterceptor } = api; addInterceptor("buildPath", fn);`),
    ).toBe(0);
    expect(hits(`api[NAME]("buildPath", fn);`)).toBe(0);
  });
});
