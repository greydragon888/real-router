import { readFileSync, globSync, existsSync } from "node:fs";
import path from "node:path";

import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every place core consults this plugin, classified (#2322).
 *
 * `packages/core/CLAUDE.md` › _Who refuses — core or the analyser_ states the
 * rule. This file is the half a rule cannot carry: the SET of places the rule
 * applies to, derived from core's source, so a new consultation cannot be added
 * without someone saying what installing the plugin changes there.
 *
 * ⚑ **The set is DERIVED and the verdict is DECLARED.** {@link CLASSIFIED} is
 * hand-written, and it is safe to keep by hand only because the keys come from
 * an AST walk: a consultation nobody classifies reds this file on the commit
 * that adds it. The same division the door census uses.
 *
 * ⚠ **`unmeasured` is the honest majority, and shrinking it is the work.** A
 * consultation is `unmeasured` until an authority pins what it changes — not
 * until someone believes it is harmless. Three candidates were checked by
 * mutation while this file was written and only one survived: no-oping
 * `validateRouteName` leaves `bare-core-message-parity` green (that file pins
 * the MESSAGE, which core's own backstop still produces), and no-oping
 * `validateParamsShape` leaves all of this package's cells green.
 *
 * ⚠ **A cited authority owns the consultation, not the door.** One method is
 * consulted from several doors, and the same door consults several methods, so
 * a row says which file reds when this method stops acting — established by
 * mutation, not by reading the file's title.
 */

const CORE_SRC = path.resolve(__dirname, "../../../core/src");
const HERE = __dirname;

/** A consultation whose name promises it only reports. */
const REPORTS = "reports — never throws";

/** A consultation nobody has pinned yet. */
const UNMEASURED = "unmeasured";

/**
 * What each consultation is: {@link REPORTS}, {@link UNMEASURED}, or the file
 * that reds when the method stops acting.
 */
const CLASSIFIED: Record<string, string> = {
  "dependencies.validateCloneArgs": UNMEASURED,
  "dependencies.validateDependenciesObject": UNMEASURED,
  "dependencies.validateDependencyCount": UNMEASURED,
  "dependencies.validateDependencyExists": UNMEASURED,
  "dependencies.validateDependencyName": UNMEASURED,
  "dependencies.validateSetDependencyArgs": UNMEASURED,
  "dependencies.warnBatchOverwrite": REPORTS,
  "dependencies.warnOverwrite": REPORTS,
  "dependencies.warnRemoveNonExistent": REPORTS,
  "eventBus.validateListenerArgs": UNMEASURED,
  "lifecycle.validateHandler": UNMEASURED,
  "navigation.validateNavigateArgs": UNMEASURED,
  "navigation.validateNavigateToDefaultArgs": UNMEASURED,
  "navigation.validateNavigateToStateArgs": UNMEASURED,
  "navigation.validateNavigationOptions": UNMEASURED,
  "navigation.validateParams": "predicate-totality-2245.test.ts",
  "navigation.validateParamsShape": UNMEASURED,
  "navigation.validateSearch": UNMEASURED,
  "navigation.validateStartArgs": UNMEASURED,
  "options.validateResolvedDefaultRoute": UNMEASURED,
  "plugins.validateNoDuplicatePlugins": UNMEASURED,
  "plugins.validatePluginLimit": UNMEASURED,
  "routes.throwIfInternalRoute": UNMEASURED,
  "routes.throwIfInternalRouteInArray": UNMEASURED,
  "routes.validateAddRouteArgs": UNMEASURED,
  "routes.validateBuildPathArgs": UNMEASURED,
  "routes.validateIsActiveRouteArgs": "predicate-totality-2245.test.ts",
  "routes.validateMatchPathArgs": UNMEASURED,
  "routes.validateParentOption": UNMEASURED,
  "routes.validateRemoveRouteArgs": UNMEASURED,
  "routes.validateRouteName": UNMEASURED,
  "routes.validateRoutes": UNMEASURED,
  "routes.validateSetRootPathArgs": UNMEASURED,
  "routes.validateShouldUpdateNodeArgs": UNMEASURED,
  "routes.validateStateBuilderArgs": UNMEASURED,
  "routes.validateUpdateRoute": UNMEASURED,
  "routes.validateUpdateRouteBasicArgs": UNMEASURED,
  "routes.validateUpdateRoutePropertyTypes": UNMEASURED,
  "state.reportDroppedQueryKey": REPORTS,
  "state.reportUndeclaredParamKey": REPORTS,
  "state.validateAreStatesEqualArgs": UNMEASURED,
  "state.validateMakeStateArgs": UNMEASURED,
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
    // someone says what installing the plugin changes at it, and a consultation
    // that is removed reds here until its row goes.
    expect(sorted(Object.keys(CLASSIFIED))).toStrictEqual(sorted(derived));
  });

  it("a name that promises a report carries the report verdict, and only those", () => {
    // ⚠ `warn*` / `report*` is a convention, and a convention with no check is
    // how a method that starts throwing keeps a name that says it does not.
    const byName = sorted(
      [...derived].filter((key) => /\.(?:warn|report)[A-Z]/u.test(key)),
    );

    const byVerdict = sorted(
      Object.entries(CLASSIFIED)
        .filter(([, verdict]) => verdict === REPORTS)
        .map(([key]) => key),
    );

    expect(byVerdict).toStrictEqual(byName);
    expect(byName.length).toBeGreaterThan(0);
  });

  it("every authority a row cites exists", () => {
    const cited = sorted(
      new Set(
        Object.values(CLASSIFIED).filter(
          (verdict) => verdict !== REPORTS && verdict !== UNMEASURED,
        ),
      ),
    );

    expect(cited.length).toBeGreaterThan(0);

    expect(
      cited.filter((file) => !existsSync(path.join(HERE, file))),
    ).toStrictEqual([]);
  });

  it("CONTROL — the walk reaches core and sees a consultation made twice", () => {
    // A walk that silently matched nothing would agree with an empty table, and
    // a walk that collapsed every site into one key would hide the file spread.
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
