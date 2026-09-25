import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import { NUM_RUNS } from "./helpers";

import type { Route, Router } from "@real-router/core";

/**
 * `add(batch, { parent })` judges the batch in the table's name space (#2566).
 *
 * The oracle is `p` declared again with its children and the batch appended,
 * in one nested `add` over the table without `p`: the spelling whose names are
 * full by construction. `{ parent }` is only another way to write it, so the
 * plugin owes both the same verdict — the same message, or both accepted.
 *
 * ⚑ The pools are small on purpose. A batch meets the name space in four ways —
 * forwarding to a route of its own by its full name, holding a short name a
 * top-level route also holds, forwarding to a child of `p` that needs `p`'s
 * param, and being refused by the name of the route whose forward is at fault
 * — and small pools make each of them common. The reach anchor at the bottom
 * counts them. The generator draws no shape defects (a bag, a callback, a name
 * that is not a string): the functional table holds those.
 *
 * Each case names its params either as words (`:id`, `:pid`) or not
 * (`:user-id`, `:p-id`). When `k` or `p` carries a name that is not a word, the
 * two spellings read it through different doors — `k` is the table's under
 * `{ parent }` and the batch's in the nested spelling — and both doors read it
 * as core does (#2569). The reach anchor counts the inputs that reach a forward
 * read through both doors: to a `k` carrying the routes' param, or from under a
 * `p` carrying the one a top-level target needs.
 */

const ACCEPTED = "accepted";

const TOP_NAMES = ["c", "d", "q"] as const;
const BATCH_NAMES = ["c", "d", "e"] as const;

/** A path for `name`, with the case's param one time in three. */
const pathFor = (name: string, param: string): fc.Arbitrary<string> =>
  fc.oneof(
    { arbitrary: fc.constant(`/${name}`), weight: 2 },
    { arbitrary: fc.constant(`/${name}/:${param}`), weight: 1 },
  );

/** Gives each route, maybe, a forward to a target outside its own subtree. */
const withForwards = (
  routes: readonly Route[],
  targets: readonly string[],
  ownPrefix: string,
): fc.Arbitrary<Route[]> =>
  fc
    .tuple(
      ...routes.map((route) => {
        const own = `${ownPrefix}${route.name}`;
        const others = targets.filter(
          (target) => target !== own && !target.startsWith(`${own}.`),
        );

        return fc.constantFrom(undefined, ...others);
      }),
    )
    .map((forwards) =>
      routes.map((route, index) =>
        forwards[index] === undefined
          ? route
          : { ...route, forwardTo: forwards[index] },
      ),
    );

/**
 * `p` and its child `k`. `p` may carry a param of its own or the one the routes
 * carry, and `k` the routes' one: a batch route that forwards to `k` needs what
 * the two declare, and it holds `p`'s only by inheriting it. The batch never
 * re-declares `k`, since its names come from another pool.
 */
const parentFor = (param: string, parentParam: string): fc.Arbitrary<Route> =>
  fc
    .constantFrom(
      ["/p", "/k"],
      ["/p", `/k/:${param}`],
      [`/p/:${parentParam}`, "/k"],
      [`/p/:${parentParam}`, `/k/:${param}`],
      [`/p/:${param}`, "/k"],
    )
    .map(([path, childPath]) => ({
      name: "p",
      path,
      children: [{ name: "k", path: childPath }],
    }));

/**
 * The table the batch joins: `p`, and two or three top-level routes, each
 * maybe forwarding to one further down the list. So the table holds no cycle,
 * and it never forwards to `p`, so the oracle's table without `p` still holds
 * every target.
 */
const tableFor = (param: string, parentParam: string): fc.Arbitrary<Route[]> =>
  fc
    .tuple(
      parentFor(param, parentParam),
      fc
        .subarray([...TOP_NAMES], { minLength: 2 })
        .chain((names) =>
          fc.tuple(
            ...names.map((name, index) =>
              fc
                .tuple(
                  pathFor(name, param),
                  fc.constantFrom(undefined, ...names.slice(index + 1)),
                )
                .map(([path, forwardTo]): Route =>
                  forwardTo === undefined
                    ? { name, path }
                    : { name, path, forwardTo },
                ),
            ),
          ),
        ),
    )
    .map(([parent, top]) => [parent, ...top]);

/** A batch route from the pool; `c` may carry a child `x`. */
const batchRouteFor = (name: string, param: string): fc.Arbitrary<Route> =>
  fc.record(
    {
      name: fc.constant(name),
      path: pathFor(name, param),
      children: fc.constant(name === "c" ? [{ name: "x", path: "/x" }] : []),
    },
    { requiredKeys: ["name", "path"] },
  );

/** Every route `routes` declares, by the full name it has under `prefix`. */
const fullNames = (routes: readonly Route[], prefix: string): string[] =>
  routes.flatMap((route) => [
    `${prefix}${route.name}`,
    ...fullNames(route.children ?? [], `${prefix}${route.name}.`),
  ]);

/**
 * A table and a batch of distinct pool names, whose forwards go to the batch's
 * own routes, to the table's, or to one no table holds.
 */
const caseArbitrary: fc.Arbitrary<readonly [Route[], Route[]]> = fc
  .tuple(fc.constantFrom("id", "user-id"), fc.constantFrom("pid", "p-id"))
  .chain(([param, parentParam]) =>
    fc.tuple(
      tableFor(param, parentParam),
      fc
        .shuffledSubarray([...BATCH_NAMES])
        .chain((names) =>
          fc.tuple(...names.map((name) => batchRouteFor(name, param))),
        ),
    ),
  )
  .chain(([table, routes]) =>
    withForwards(
      routes,
      [...fullNames(routes, "p."), ...fullNames(table, ""), "ghost"],
      "p.",
    ).map((batch) => [table, batch] as const),
  );

const rootPathArbitrary = fc.constantFrom(undefined, "/:lang");

function verdict(run: () => void): string {
  try {
    run();

    return ACCEPTED;
  } catch (error) {
    return (error as Error).message;
  }
}

/** A router over `routes` with the plugin installed, or `undefined` when either refuses them. */
function guardedRouter(
  routes: readonly Route[],
  rootPath: string | undefined,
): Router | undefined {
  try {
    const router = createRouter([...routes]);

    if (rootPath !== undefined) {
      getPluginApi(router).setRootPath(rootPath);
    }

    router.usePlugin(validationPlugin());

    return router;
  } catch {
    return undefined;
  }
}

const underParent = (router: Router, batch: readonly Route[]): string =>
  verdict(() => {
    getRoutesApi(router).add([...batch], { parent: "p" });
  });

const nested = (
  router: Router,
  parent: Route,
  batch: readonly Route[],
): string =>
  verdict(() => {
    getRoutesApi(router).add([
      { ...parent, children: [...(parent.children ?? []), ...batch] },
    ]);
  });

describe("add(batch, { parent }) judges the batch in the table's name space (#2566)", () => {
  test.prop([caseArbitrary, rootPathArbitrary], {
    numRuns: NUM_RUNS.thorough * 3,
  })(
    "{ parent } answers as the nested spelling does",
    ([table, batch], rootPath) => {
      const withParent = guardedRouter(table, rootPath);
      const [parent, ...rest] = table;
      const withoutParent = guardedRouter(rest, rootPath);

      // A table the plugin refuses at install has nothing to add to.
      fc.pre(withParent !== undefined && withoutParent !== undefined);

      expect(underParent(withParent, batch)).toBe(
        nested(withoutParent, parent, batch),
      );
    },
  );

  // ⚑ The two anchors below hold the property's own inputs. Without the plugin
  // both spellings are bare core's, which answer alike, so the property passes
  // on a router the plugin never ran on; and a generator that stopped reaching
  // the name space passes as well.

  it("the routers under test carry the plugin", () => {
    // A forward to no route: the plugin refuses it, bare core accepts it.
    expect(
      underParent(guardedRouter([{ name: "p", path: "/p" }], undefined)!, [
        { name: "c", path: "/c", forwardTo: "p.ghost" },
      ]),
    ).toBe(
      `[router.addRoute] forwardTo target "p.ghost" does not exist for route "p.c"`,
    );
  });

  it("the generator reaches all four ways, and a non-word name read through both doors", () => {
    const SAMPLES = 500;
    const reached: Record<Way, number> = {
      forwardsIntoBatch: 0,
      shortNameClosesAChain: 0,
      inheritsTheParentParam: 0,
      refusedByFullName: 0,
      nonWordAcrossDoors: 0,
    };
    let kept = 0;

    for (const [table, batch] of fc.sample(caseArbitrary, {
      numRuns: SAMPLES,
      seed: 2566,
    })) {
      const router = guardedRouter(table, undefined);

      // Counted only over tables the property keeps, since `fc.pre` skips the
      // rest: a count taken before it passes on inputs no run executes.
      if (router === undefined || !guardedRouter(table.slice(1), undefined)) {
        continue;
      }

      kept++;

      const met = waysMet(table, batch, underParent(router, batch));

      for (const way of Object.keys(reached) as Way[]) {
        if (met[way]) {
          reached[way]++;
        }
      }
    }

    for (const count of Object.values(reached)) {
      expect(count).toBeGreaterThanOrEqual(kept / 40);
    }
  });
});

type Way =
  | "forwardsIntoBatch"
  | "shortNameClosesAChain"
  | "inheritsTheParentParam"
  | "refusedByFullName"
  | "nonWordAcrossDoors";

const isNonWord = (path: string | undefined): boolean =>
  path?.includes(":user-id") ?? false;

/**
 * The ways an input meets, each counted only where the verdict shows the check
 * at fault was reached: a batch refused for another reason first never reaches
 * it.
 *
 * ⚠ A witness is reach, not a guaranteed catch. A plugin that got one of the
 * first four ways wrong answers differently on every counted input, since only
 * the `{ parent }` spelling depends on them; a misreading of names affects both
 * spellings, and an earlier forward misread alike in both can hide the one the
 * witness counts.
 */
function waysMet(
  table: readonly Route[],
  batch: readonly Route[],
  answer: string,
): Record<Way, boolean> {
  const accepted = answer === ACCEPTED;
  const forwards = batch.flatMap((route) => forwardOf(route));
  const own = new Set(fullNames(batch, "p."));
  const [parent, ...top] = table;
  const kIsNonWord = isNonWord(parent.children?.[0]?.path);

  return {
    forwardsIntoBatch: accepted && forwards.some(([, to]) => own.has(to)),
    // Keyed by its short name, a batch route's forward would stand in for the
    // top-level route of that name, and the table's forwards carry on from it.
    shortNameClosesAChain:
      accepted &&
      closesACycle(
        new Map([...table.flatMap((route) => forwardOf(route)), ...forwards]),
      ),
    inheritsTheParentParam:
      accepted &&
      parent.path !== "/p" &&
      forwards.some(([, to]) => to === "p.k"),
    refusedByFullName: /(?:for|source) route "p\./u.test(answer),
    // A non-word name read through both doors: `k` is the table's under
    // `{ parent }` and the batch's when `p` is declared again, and so is the
    // param `p` hands down. Either verdict names what each door read.
    nonWordAcrossDoors:
      (accepted &&
        forwards.some(
          ([, to]) =>
            (to === "p.k" && kIsNonWord) ||
            (isNonWord(parent.path) &&
              top.some((route) => route.name === to && isNonWord(route.path))),
        )) ||
      (kIsNonWord && answer.includes('forwardTo target "p.k" requires params')),
  };
}

/** A route's forward to a named target, as `[name, target]`. */
function forwardOf({ name, forwardTo }: Route): [string, string][] {
  return typeof forwardTo === "string" ? [[name, forwardTo]] : [];
}

/** Whether following the forwards from some route comes back to a route already passed. */
function closesACycle(forwards: ReadonlyMap<string, string>): boolean {
  return [...forwards.keys()].some((start) => {
    const passed = new Set<string>();

    for (
      let at: string | undefined = start;
      at !== undefined;
      at = forwards.get(at)
    ) {
      if (passed.has(at)) {
        return true;
      }

      passed.add(at);
    }

    return false;
  });
}
