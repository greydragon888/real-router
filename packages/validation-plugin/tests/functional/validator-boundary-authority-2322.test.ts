import { readFileSync, globSync, existsSync } from "node:fs";
import path from "node:path";

import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every place core consults this plugin, and what reds when it stops acting
 * (#2322).
 *
 * `packages/core/CLAUDE.md` › _Who refuses — core or the analyser_ states the
 * rule. This file is the half a rule cannot carry: the SET of places it applies
 * to, derived from core's source, so a new consultation cannot be added without
 * someone saying where its effect is held.
 *
 * ⚑ **The set is DERIVED and the owner is DECLARED.** {@link OWNER} is
 * hand-written, and it is safe to keep by hand only because the keys come from
 * an AST walk: a consultation nobody classifies reds this file on the commit
 * that adds it. The same division the door census uses.
 *
 * ⚑ **Every row was established by MUTATION, not by reading a file's title.**
 * Each consultation was replaced with a no-op and this package's whole suite
 * run against it; the row names one file that went red. It is not the only one
 * — several consultations red four or five — it is the most subject-specific of
 * them, so the row points a reader at the nearest authority rather than at a
 * list that churns whenever a neighbouring test is added.
 *
 * ⚠ **A no-op that reds NOTHING has two causes, and they are not the same.**
 * Either the consultation's effect is genuinely unpinned, or core refuses the
 * same input first and the plugin's copy can never fire — the shape #2307
 * found for the four `queryParams` format lists and deleted. {@link UNPINNED}
 * does not distinguish them, and telling them apart is the next step for each
 * of the rows carrying it.
 */

const CORE_SRC = path.resolve(__dirname, "../../../core/src");
const HERE = __dirname;

/** No file in this package reds when this consultation stops acting. */
const UNPINNED = "unpinned";

/**
 * One file that reds when the consultation is replaced with a no-op, or
 * {@link UNPINNED}.
 */
const OWNER: Record<string, string> = {
  "dependencies.validateCloneArgs": "dependencies.validation.test.ts",
  "dependencies.validateDependenciesObject": "plain-bag-mirror-2282.test.ts",
  "dependencies.validateDependencyCount": "limits.test.ts",
  "dependencies.validateDependencyExists": "dependencies.validation.test.ts",
  "dependencies.validateDependencyName": "dependencies.validation.test.ts",
  "dependencies.validateSetDependencyArgs": "dependencies.validation.test.ts",
  "dependencies.warnBatchOverwrite": UNPINNED,
  "dependencies.warnOverwrite": "dependencies-reentrancy-1859.test.ts",
  "dependencies.warnRemoveNonExistent": "dependencies.validation.test.ts",
  "eventBus.validateListenerArgs": UNPINNED,
  "lifecycle.validateHandler": "lifecycle.validation.test.ts",
  "navigation.validateNavigateArgs": "navigation.validation.test.ts",
  "navigation.validateNavigateToDefaultArgs": "defaults-mutation-2148.test.ts",
  "navigation.validateNavigateToStateArgs": "navigation.validation.test.ts",
  "navigation.validateNavigationOptions": "navigation.validation.test.ts",
  "navigation.validateParams": "predicate-totality-2245.test.ts",
  "navigation.validateParamsShape": UNPINNED,
  "navigation.validateSearch": "both-channels-authority-1972.test.ts",
  "navigation.validateStartArgs": "router-methods.validation.test.ts",
  "options.validateResolvedDefaultRoute":
    "integration/retrospective-integration.test.ts",
  "plugins.validateNoDuplicatePlugins": "integration/plugin-lifecycle.test.ts",
  "plugins.validatePluginLimit": "limits.test.ts",
  "routes.throwIfInternalRoute": UNPINNED,
  "routes.throwIfInternalRouteInArray": UNPINNED,
  "routes.validateAddRouteArgs": "routes.validation.test.ts",
  "routes.validateBuildPathArgs": "router-methods.validation.test.ts",
  "routes.validateIsActiveRouteArgs": "predicate-totality-2245.test.ts",
  "routes.validateMatchPathArgs": UNPINNED,
  "routes.validateParentOption": UNPINNED,
  "routes.validateRemoveRouteArgs": "bare-core-message-parity.test.ts",
  "routes.validateRouteName": "route-name-doors.test.ts",
  "routes.validateRoutes": "structural-field-coverage-authority-1787.test.ts",
  "routes.validateSetRootPathArgs": "routes.validation.test.ts",
  "routes.validateShouldUpdateNodeArgs": "router-methods.validation.test.ts",
  "routes.validateStateBuilderArgs": "plugin-api.validation.test.ts",
  "routes.validateUpdateRoute": "integration/routes-coverage.test.ts",
  "routes.validateUpdateRouteBasicArgs": "bare-core-message-parity.test.ts",
  "routes.validateUpdateRoutePropertyTypes": "routes.validation.test.ts",
  "state.reportDroppedQueryKey": "dropped-query-key.test.ts",
  "state.reportUndeclaredParamKey": "undeclared-param-key.test.ts",
  "state.validateAreStatesEqualArgs": "plugin-api.validation.test.ts",
  "state.validateMakeStateArgs": "plugin-api.validation.test.ts",
};

/** Every `…validator?.<ns>.<method>(…)` core makes, with its file. */
function consultations(): { key: string; file: string }[] {
  const found: { key: string; file: string }[] = [];

  for (const file of globSync(`${CORE_SRC}/**/*.ts`)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.ESNext,
      true,
    );

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const match =
          /validator\?\.(?<ns>[a-zA-Z]+)\.(?<method>[a-zA-Z]+)$/u.exec(
            node.expression.getText(source),
          );

        if (match?.groups) {
          found.push({
            key: `${match.groups.ns}.${match.groups.method}`,
            file: path.relative(CORE_SRC, file),
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return found;
}

const sorted = (names: Iterable<string>): string[] =>
  [...names].toSorted((left, right) => left.localeCompare(right));

describe("every consultation core makes is classified (#2322)", () => {
  const sites = consultations();
  const derived = new Set(sites.map(({ key }) => key));

  it("the declared table covers the derived set, in both directions", () => {
    // ⚑ This is the ratchet. A new `ctx.validator?.x.y(...)` reds here until
    // someone runs it against this package's suite and records what held it,
    // and a consultation that is removed reds here until its row goes.
    expect(sorted(Object.keys(OWNER))).toStrictEqual(sorted(derived));
  });

  it("every authority a row cites exists", () => {
    const cited = sorted(
      new Set(Object.values(OWNER).filter((owner) => owner !== UNPINNED)),
    );

    expect(cited.length).toBeGreaterThan(0);

    expect(
      cited.filter((file) => !existsSync(path.join(HERE, file))),
    ).toStrictEqual([]);
  });

  it("the unpinned set is exactly what the sweep found — and it is the debt", () => {
    // ⚠ EXACT, not a floor. A row that acquires an owner must be moved by hand,
    // which is the point: the shrinking is a decision someone makes, not a
    // number that drifts. ⚑ Two of these are suspected #2307 shapes rather than
    // gaps — core refuses the same input first, so the plugin's copy can never
    // fire — and `eventBus.validateListenerArgs` is the sharpest candidate,
    // since core's always-on guard already refuses both of its arguments.
    expect(
      sorted(
        Object.entries(OWNER)
          .filter(([, owner]) => owner === UNPINNED)
          .map(([key]) => key),
      ),
    ).toStrictEqual([
      "dependencies.warnBatchOverwrite",
      "eventBus.validateListenerArgs",
      "navigation.validateParamsShape",
      "routes.throwIfInternalRoute",
      "routes.throwIfInternalRouteInArray",
      "routes.validateMatchPathArgs",
      "routes.validateParentOption",
    ]);
  });

  it("CONTROL — the walk reaches core and sees a consultation made twice", () => {
    // A walk that silently matched nothing would agree with an empty table, and
    // one that collapsed every site into one key would hide the file spread.
    expect(derived).toContain("routes.validateBuildPathArgs");
    expect(sites.length).toBeGreaterThan(derived.size);
  });
});

describe("the analyser's reach decides which side refuses (#2322)", () => {
  const router = createRouter([{ name: "a", path: "/a" }], {
    logger: { level: "warn-error" },
    queryParams: { arrayFormat: "none" },
  });
  const stored: object = getInternals(router).getOptions();

  it("what the retrospective pass reads is what the plugin can judge", () => {
    // Anti-vacuum: an empty bag would make the absence below meaningless.
    expect(Object.keys(stored).length).toBeGreaterThan(0);

    expect("queryParams" in stored).toBe(true);
  });

  it("logger is stripped before the pass runs, so core refuses there instead", () => {
    // ⚑ The rule's second clause, as a measurement rather than a sentence: this
    // is the one closed sub-bag the analyser cannot see, and the only one whose
    // unknown KEY bare core refuses.
    expect("logger" in stored).toBe(false);

    expect(() =>
      createRouter([{ name: "a", path: "/a" }], {
        logger: { bogus: 1 } as never,
      }),
    ).toThrow('Unknown logger config property: "bogus"');
  });

  it("CONTROL — an unknown key in a bag the pass DOES read is not core's to refuse", () => {
    expect(() =>
      createRouter([{ name: "a", path: "/a" }], {
        queryParams: { bogus: 1 } as never,
      }),
    ).not.toThrow();
  });
});
