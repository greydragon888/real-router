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
 */

const ACCEPTED = "accepted";

const TOP_NAMES = ["c", "d", "q"] as const;
const BATCH_NAMES = ["c", "d", "e"] as const;

/** A path for `name`, with a param one time in three. */
const pathFor = (name: string): fc.Arbitrary<string> =>
  fc.oneof(
    { arbitrary: fc.constant(`/${name}`), weight: 2 },
    { arbitrary: fc.constant(`/${name}/:id`), weight: 1 },
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
 * `p`, maybe with a param, and its child `k`. A batch route that forwards to
 * `k` needs any param `p` has, which it holds only by inheriting it; the batch
 * never re-declares `k`, since its names come from another pool.
 */
const parentArbitrary: fc.Arbitrary<Route> = fc
  .constantFrom("/p", "/p/:pid")
  .map((path) => ({
    name: "p",
    path,
    children: [{ name: "k", path: "/k" }],
  }));

/**
 * The table the batch joins: `p`, and two or three top-level routes, each
 * maybe forwarding to one further down the list. So the table holds no cycle,
 * and it never forwards to `p`, so the oracle's table without `p` still holds
 * every target.
 */
const tableArbitrary: fc.Arbitrary<Route[]> = fc
  .tuple(
    parentArbitrary,
    fc
      .subarray([...TOP_NAMES], { minLength: 2 })
      .chain((names) =>
        fc.tuple(
          ...names.map((name, index) =>
            fc
              .tuple(
                pathFor(name),
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
const batchRouteFor = (name: string): fc.Arbitrary<Route> =>
  fc.record(
    {
      name: fc.constant(name),
      path: pathFor(name),
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
  .tuple(
    tableArbitrary,
    fc
      .shuffledSubarray([...BATCH_NAMES])
      .chain((names) => fc.tuple(...names.map((name) => batchRouteFor(name)))),
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

  it("the generator reaches all four ways a batch meets the name space", () => {
    // Each count is of inputs on which a plugin that got that way wrong would
    // answer differently: the verdict it gets is part of the witness, since a
    // batch refused for another reason first never reaches the check at fault.
    const SAMPLES = 500;
    const reached = {
      forwardsIntoBatch: 0,
      shortNameClosesAChain: 0,
      inheritsTheParentParam: 0,
      refusedByFullName: 0,
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

      const answer = underParent(router, batch);
      const forwards = batch.flatMap((route) => forwardOf(route));
      const own = new Set(fullNames(batch, "p."));

      if (answer === ACCEPTED && forwards.some(([, to]) => own.has(to))) {
        reached.forwardsIntoBatch++;
      }

      // Keyed by its short name, a batch route's forward would stand in for the
      // top-level route of that name, and the table's forwards carry on from it.
      if (
        answer === ACCEPTED &&
        closesACycle(
          new Map([...table.flatMap((route) => forwardOf(route)), ...forwards]),
        )
      ) {
        reached.shortNameClosesAChain++;
      }

      if (
        answer === ACCEPTED &&
        table[0].path === "/p/:pid" &&
        forwards.some(([, to]) => to === "p.k")
      ) {
        reached.inheritsTheParentParam++;
      }

      if (/(?:for|source) route "p\./u.test(answer)) {
        reached.refusedByFullName++;
      }
    }

    for (const count of Object.values(reached)) {
      expect(count).toBeGreaterThanOrEqual(kept / 40);
    }
  });
});

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
