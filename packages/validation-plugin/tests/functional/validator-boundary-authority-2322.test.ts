import { readFileSync, globSync, existsSync } from "node:fs";
import path from "node:path";

import { createRouter } from "@real-router/core";
import {
  getDependenciesApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import * as ts from "typescript";
import { describe, expect, it, vi } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

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
 * Either the effect is genuinely unheld, or core refuses the same input first
 * with the same wording, so the copy can never be observed — the shape #2307
 * found for the four `queryParams` format lists and deleted. Seven rows came
 * back silent and split two ways: the third describe below holds FIVE that were
 * real and unheld, and {@link MIRRORED} names two core refuses first.
 *
 * ⚠ **Silence is not redundancy, and two rows proved it the expensive way.**
 * `validateParamsShape` was classified as superseded — a sibling produces the
 * same message at every door, measured. What the sibling cannot reproduce is
 * WHEN: the shape half runs before `adoptChannel` asks the caller's bag for its
 * own keys, so removing it adds an `ownKeys` trap on application code ahead of
 * the refusal. The cell below pins the trap sequence rather than the message,
 * which is the only form that can tell the two apart. `throwIfInternalRouteInArray`
 * went the same way for a different reason: it IS identical to core's backstop
 * at `addRoute`, and at `replaceRoutes` it is not — core's runs inside the add
 * path and names `addRoute`, a door the caller never called.
 *
 * ⚠ **A parity test cannot own a mirrored consultation, by construction.**
 * `bare-core-message-parity` compares the two tiers' MESSAGES, so it passes
 * whichever tier produced one — which is why no-oping `validateListenerArgs`
 * leaves it green although it does exercise that door. The mirroring is a
 * recorded decision (#1047 for the reserved prefix, #1888 / #2088 for the
 * listener arguments), not a gap to report as one.
 */

const CORE_SRC = path.resolve(__dirname, "../../../core/src");
const HERE = __dirname;

/**
 * Core refuses the same input with the same wording, so no cell can tell the
 * tiers apart — the copy is a deliberate mirror, not a gap.
 *
 * ⚠ Unobservable is not unheld. The two WORDINGS are held against each other by
 * `bare-core-message-parity`, which calls this plugin's copy directly rather
 * than driving the door; what no cell can catch is the copy being REMOVED,
 * because core then prints the same string.
 */
const MIRRORED = "mirrored — core refuses first, same wording";

/** Held by the third describe in THIS file, because nothing else held it. */
const SELF = "validator-boundary-authority-2322.test.ts";

/**
 * One file that reds when the consultation is replaced with a no-op, or
 * {@link MIRRORED} when nothing can.
 */
const OWNER: Record<string, string> = {
  "dependencies.validateCloneArgs": "dependencies.validation.test.ts",
  "dependencies.validateDependenciesObject": "plain-bag-mirror-2282.test.ts",
  "dependencies.validateDependencyCount": "limits.test.ts",
  "dependencies.validateDependencyExists": "dependencies.validation.test.ts",
  "dependencies.validateDependencyName": "dependencies.validation.test.ts",
  "dependencies.validateSetDependencyArgs": "dependencies.validation.test.ts",
  "dependencies.warnBatchOverwrite": SELF,
  "dependencies.warnOverwrite": "dependencies-reentrancy-1859.test.ts",
  "dependencies.warnRemoveNonExistent": "dependencies.validation.test.ts",
  "eventBus.validateListenerArgs": MIRRORED,
  "lifecycle.validateHandler": "lifecycle.validation.test.ts",
  "navigation.validateNavigateToDefaultArgs": "defaults-mutation-2148.test.ts",
  "navigation.validateNavigateToStateArgs": "navigation.validation.test.ts",
  "navigation.validateNavigationOptions": "navigation.validation.test.ts",
  "navigation.validateParamsShape": SELF,
  "navigation.validateSearch": "both-channels-authority-1972.test.ts",
  "navigation.validateStartArgs": "router-methods.validation.test.ts",
  "options.validateResolvedDefaultRoute":
    "integration/retrospective-integration.test.ts",
  "plugins.validateNoDuplicatePlugins": "integration/plugin-lifecycle.test.ts",
  "plugins.validatePluginLimit": "limits.test.ts",
  "routes.throwIfInternalRoute": MIRRORED,
  "routes.throwIfInternalRouteInArray": SELF,
  "routes.validateAddRouteArgs": "routes.validation.test.ts",
  "routes.validateBuildPathArgs": "router-methods.validation.test.ts",
  "routes.validateIsActiveRouteArgs": "predicate-totality-2245.test.ts",
  "routes.validateMatchPathArgs": SELF,
  "routes.validateParentOption": SELF,
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
      new Set(Object.values(OWNER).filter((owner) => owner !== MIRRORED)),
    );

    expect(cited.length).toBeGreaterThan(0);

    expect(
      cited.filter((file) => !existsSync(path.join(HERE, file))),
    ).toStrictEqual([]);
  });

  it("the copies nothing can observe are exactly two", () => {
    // ⚠ EXACT, not a floor. A row leaving this set is someone deciding the copy
    // became observable — or that it should go, the way #2307 retired four
    // lists once measurement showed core refusing first.
    expect(
      sorted(
        Object.entries(OWNER)
          .filter(([, owner]) => owner === MIRRORED)
          .map(([key]) => key),
      ),
    ).toStrictEqual([
      "eventBus.validateListenerArgs",
      "routes.throwIfInternalRoute",
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

describe("the five consultations nothing else held (#2322)", () => {
  // ⚑ Each cell asserts BOTH arms. Asserting only the plugin's would pass for a
  // consultation core already covers, which is exactly what the sweep had to
  // separate out — and it is what makes no-oping the method red this file.
  const ROUTES = [
    { name: "a", path: "/a/:id" },
    { name: "b", path: "/b" },
  ];

  const make = (withPlugin: boolean): Router => {
    const router = createRouter([...ROUTES], { allowNotFound: true });

    if (withPlugin) {
      router.usePlugin(validationPlugin());
    }

    return router;
  };

  const refusalOf = (run: (router: Router) => unknown, withPlugin: boolean) => {
    try {
      run(make(withPlugin));

      return "NO THROW";
    } catch (error) {
      return (error as Error).message;
    }
  };

  it("warnBatchOverwrite — setDependencies says which keys it replaced", () => {
    const router = make(true);
    const warn = vi
      .spyOn(getInternals(router).logger, "warn")
      .mockImplementation(() => undefined);

    getDependenciesApi(router).setAll({ x: 1 });
    getDependenciesApi(router).setAll({ x: 2 });

    expect(warn.mock.calls.map((call) => call.join(" "))).toStrictEqual([
      "router.setDependencies Overwritten: x",
    ]);

    const bareRouter = make(false);
    const bareWarn = vi
      .spyOn(getInternals(bareRouter).logger, "warn")
      .mockImplementation(() => undefined);

    getDependenciesApi(bareRouter).setAll({ x: 1 });
    getDependenciesApi(bareRouter).setAll({ x: 2 });

    expect(bareWarn.mock.calls).toStrictEqual([]);
  });

  it("validateParamsShape — the refusal lands BEFORE the caller's bag is walked", () => {
    // ⚑ The subject is the TRAP SEQUENCE, not the message: every door produces
    // the same wording either way, because `isParams` re-applies the shape rules
    // to core's copy one call later. What only this consultation can do is
    // refuse before `adoptChannel` asks the bag for its own keys — application
    // code that a wrong-shape argument should never have reached.
    const reads: string[] = [];

    // A class INSTANCE, because a wrong shape is what the consultation refuses;
    // the accessor is on the prototype, which is what makes it the wrong shape.
    const instance = Object.create({
      get id(): string {
        return "7";
      },
    }) as object;

    const watched = new Proxy(instance, {
      get(target, key, receiver) {
        if (typeof key === "string") {
          reads.push(`get:${key}`);
        }

        return Reflect.get(target, key, receiver) as unknown;
      },
      ownKeys(target) {
        reads.push("ownKeys");

        return Reflect.ownKeys(target);
      },
    });

    expect(() => make(true).buildPath("a", watched as never)).toThrow(
      "params must be a plain object",
    );

    expect(reads).toStrictEqual(["get:constructor"]);
  });

  it("throwIfInternalRouteInArray — replaceRoutes names the door the caller called", () => {
    // ⚑ The only site of the four where this is not a mirror. Core's own refusal
    // lives inside the add path, so bare it reports `addRoute` for a call the
    // application made to `replace` — the plugin's copy is what keeps the door
    // name true. At `addRoute` itself the two are identical, which is why a
    // cell built on that door alone would pass with the copy removed.
    const run = (router: Router): unknown => {
      getRoutesApi(router).replace([{ name: "@@x", path: "/x" }]);

      return undefined;
    };

    expect(refusalOf(run, true)).toMatch(/^\[router\.replaceRoutes\]/u);

    expect(refusalOf(run, false)).toMatch(/^\[router\.addRoute\]/u);
  });

  it("validateMatchPathArgs — a non-string path is named, not a crash inside", () => {
    const run = (router: Router): unknown =>
      getPluginApi(router).matchPath(123 as never);

    expect(refusalOf(run, true)).toBe(
      "[router.matchPath] path must be a string, got number",
    );

    expect(refusalOf(run, false)).toBe("path.codePointAt is not a function");
  });

  it("validateParentOption — a non-string parent is refused by TYPE", () => {
    // ⚠ Bare core answers too, and differently: it reads the value as a name and
    // reports the route as missing. The divergence is the message, which is the
    // whole product of this consultation.
    const run = (router: Router): unknown => {
      getRoutesApi(router).add(
        { name: "k", path: "/k" },
        { parent: 42 as never },
      );

      return undefined;
    };

    expect(refusalOf(run, true)).toBe(
      "[router.addRoute] parent option must be a non-empty string, got number",
    );

    expect(refusalOf(run, false)).toBe(
      '[router.addRoute] Parent route "42" does not exist',
    );
  });
});
