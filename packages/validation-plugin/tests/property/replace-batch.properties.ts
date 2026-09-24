import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import { NUM_RUNS } from "./helpers";

import type { Route, Router } from "@real-router/core";

/**
 * `replace()` judges its batch as the whole new table (#2562).
 *
 * The oracle is the same batch ADDED to an empty router under the same root:
 * that is the table `replace` produces, reached through the door that extends a
 * table rather than discarding one. Whatever the plugin says there, it says on
 * `replace` whatever the table being replaced holds.
 *
 * ⚑ The pools are small on purpose. The replaced table reached the verdict
 * through its tree, its lookup and its forward map, and a batch meets them only
 * by colliding with the table — re-declaring its routes, forwarding to a route
 * it drops, reversing a forward it holds, among others. Three names make
 * collisions common, and the reach anchor at the bottom counts those three.
 */

const ACCEPTED = "accepted";

const NAMES = ["a", "b", "c"] as const;

const childArbitrary: fc.Arbitrary<Route> = fc.record({
  name: fc.constant("x"),
  path: fc.constantFrom("/x", "/:xid"),
});

/**
 * A route named from the pool, without a forward. Its path derives from its
 * name, so two routes of one table collide on a path only through the rarer
 * shared paths — which are how a batch gives a current path to a new name.
 */
const routeArbitrary: fc.Arbitrary<Route> = fc
  .constantFrom(...NAMES)
  .chain((name) =>
    fc.record(
      {
        name: fc.constant(name),
        path: fc.oneof(
          { weight: 4, arbitrary: fc.constantFrom(`/${name}`, `/${name}/:id`) },
          { weight: 1, arbitrary: fc.constantFrom("/a", "~c") },
        ),
        children: fc.array(childArbitrary, { minLength: 1, maxLength: 1 }),
      },
      { requiredKeys: ["name", "path"] },
    ),
  );

/** Every full name `routes` declares. */
const namesOf = (routes: readonly Route[]): string[] =>
  routes.flatMap((route) => [
    route.name,
    ...(route.children ?? []).map((child) => `${route.name}.${child.name}`),
  ]);

/** A table's routes without their forwards, as one comparable string. */
const routesOf = (routes: readonly Route[]): string =>
  JSON.stringify(
    routes.map(({ name, path, children }) => ({ name, path, children })),
  );

/** Gives each route, maybe, a forward to a target outside its own subtree. */
const withForwards = (
  routes: readonly Route[],
  targets: readonly string[],
): fc.Arbitrary<Route[]> =>
  fc
    .tuple(
      ...routes.map((route) => {
        const others = targets.filter(
          (target) => target.split(".", 1)[0] !== route.name,
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

/** The routes of the table `replace` swaps out: at least one, no name twice. */
const tableRoutesArbitrary = fc.uniqueArray(routeArbitrary, {
  selector: (route) => route.name,
  minLength: 1,
  maxLength: 3,
});

/**
 * The batch: any names, one possibly more than once, forwarding anywhere in the
 * pool — a route it keeps, one it drops, or one no table holds.
 */
const batchArbitrary = fc
  .array(routeArbitrary, { maxLength: 3 })
  .chain((routes) => withForwards(routes, [...NAMES, "b.x", "ghost"]));

/**
 * A table and the batch that replaces it. The table forwards only to its own
 * routes, which keeps most tables installable; `fc.pre` skips the rest. Half
 * the batches are the table's own routes with their forwards drawn again — the
 * HMR edit. It is the shape that brings a forward map left over from the
 * replaced table into the verdict often enough for this property to see it;
 * without it, that fact rests on the functional table's reversed-forward row.
 */
const replacementArbitrary = tableRoutesArbitrary.chain((routes) =>
  fc.tuple(
    withForwards(routes, namesOf(routes)),
    fc.oneof(batchArbitrary, withForwards(routes, namesOf(routes))),
  ),
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

describe("replace() judges its batch as the whole new table (#2562)", () => {
  // More runs than this package's default: the stale forward map is in the
  // verdict in few runs, and the functional table pins it deterministically.
  test.prop([replacementArbitrary, rootPathArbitrary], {
    numRuns: NUM_RUNS.thorough * 3,
  })(
    "replace answers as add answers into an empty router under the same root",
    ([before, batch], rootPath) => {
      const replaced = guardedRouter(before, rootPath);
      const empty = guardedRouter([], rootPath);

      // A table the plugin refuses at install has nothing to replace.
      fc.pre(replaced !== undefined);

      expect(
        verdict(() => {
          getRoutesApi(replaced).replace([...batch]);
        }),
      ).toBe(
        verdict(() => {
          getRoutesApi(empty!).add([...batch]);
        }),
      );
    },
  );

  // ⚑ The two anchors below hold the property's own inputs. Without the plugin
  // both doors are bare core's, which answer alike, so the property passes on
  // a router the plugin never ran on; and a generator that stopped reaching the
  // three ways the replaced table reached the verdict passes as well.

  it("the routers under test carry the plugin", () => {
    // A forward to no route: the plugin refuses it, bare core accepts it.
    expect(
      verdict(() => {
        getRoutesApi(guardedRouter([], undefined)!).add([
          { name: "x", path: "/x", forwardTo: "ghost" },
        ]);
      }),
    ).toBe(
      `[router.addRoute] forwardTo target "ghost" does not exist for route "x"`,
    );
  });

  it("the generator reaches each way the replaced table reached the verdict", () => {
    const SAMPLES = 500;
    const reached = { redeclares: 0, forwardsToDropped: 0, reversesForward: 0 };

    for (const [before, batch] of fc.sample(replacementArbitrary, {
      numRuns: SAMPLES,
      seed: 2562,
    })) {
      // Counted only over tables the property keeps, since `fc.pre` skips the
      // rest: a count taken before it passes on inputs no run executes.
      if (guardedRouter(before, undefined) === undefined) {
        continue;
      }

      const held = new Set(namesOf(before));
      const declared = new Set(namesOf(batch));

      if ([...declared].some((name) => held.has(name))) {
        reached.redeclares++;
      }

      if (
        batch.some(
          ({ forwardTo }) =>
            typeof forwardTo === "string" &&
            held.has(forwardTo) &&
            !declared.has(forwardTo),
        )
      ) {
        reached.forwardsToDropped++;
      }

      // Counted on the HMR shape, the one that brings the stale forward map
      // into the verdict often enough (see `replacementArbitrary`).
      if (
        routesOf(batch) === routesOf(before) &&
        batch.some((route) =>
          before.some(
            (old) =>
              old.name === route.forwardTo && old.forwardTo === route.name,
          ),
        )
      ) {
        reached.reversesForward++;
      }
    }

    for (const count of Object.values(reached)) {
      expect(count).toBeGreaterThanOrEqual(SAMPLES / 100);
    }
  });
});
