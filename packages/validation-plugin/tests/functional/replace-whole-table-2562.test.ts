import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Route, Router } from "@real-router/core";

/**
 * `replace()` judges its batch as the whole new table (#2562).
 *
 * `add` extends the registered table, so its batch is judged against it.
 * `replace` discards that table: judged against it, a batch that keeps a route
 * is refused as a duplicate, and a forward resolves against a route the batch
 * drops. The reference for every row is the same batch ADDED to an empty router
 * under the same root — the table `replace` produces, reached through the door
 * whose judgement is not in question.
 *
 * ⚑ **A cell pins all three verdicts, not only the replace one.** Without the
 * plugin, the reference and the replace verdict agree on every row below, so a
 * cell that compared only those two would pass on a plugin that never ran. The
 * refusals below that bare core does not make are what prove it ran.
 */

const ACCEPTED = "accepted";

interface Row {
  readonly what: string;
  /** The table `replace` swaps out. */
  readonly before: readonly Route[];
  readonly batch: readonly Route[];
  readonly rootPath?: string;
  /** The plugin's verdict, on `replace` and on the reference alike. */
  readonly plugin: string;
  /** Bare core's verdict on the same `replace`. */
  readonly bare: string;
}

const ROWS: readonly Row[] = [
  {
    what: "re-declares nothing the current table holds",
    before: [{ name: "home", path: "/" }],
    batch: [
      { name: "a", path: "/a" },
      { name: "b", path: "/b", forwardTo: "a" },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "re-declares every route it replaces (the HMR recipe)",
    before: [
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ],
    batch: [
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "gives a current path to a new name",
    before: [{ name: "home", path: "/" }],
    batch: [{ name: "root", path: "/" }],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "re-declares a nested route",
    before: [
      {
        name: "users",
        path: "/users",
        children: [{ name: "view", path: "/:id" }],
      },
    ],
    batch: [
      {
        name: "users",
        path: "/users",
        children: [{ name: "view", path: "/:id" }],
      },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards to a route it keeps",
    before: [
      { name: "home", path: "/" },
      { name: "target", path: "/target" },
    ],
    batch: [
      { name: "target", path: "/target" },
      { name: "x", path: "/x", forwardTo: "target" },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "keeps a forward target and drops the param it had",
    before: [
      { name: "home", path: "/" },
      { name: "target", path: "/target/:id" },
    ],
    batch: [
      { name: "target", path: "/target" },
      { name: "x", path: "/x", forwardTo: "target" },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "reverses a forward the current table holds",
    before: [
      { name: "a", path: "/a", forwardTo: "b" },
      { name: "b", path: "/b" },
    ],
    batch: [
      { name: "a", path: "/a" },
      { name: "b", path: "/b", forwardTo: "a" },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards to a route it drops",
    before: [
      { name: "home", path: "/" },
      { name: "target", path: "/target" },
    ],
    batch: [{ name: "x", path: "/x", forwardTo: "target" }],
    plugin: `[router.addRoute] forwardTo target "target" does not exist for route "x"`,
    bare: ACCEPTED,
  },
  {
    what: "forwards to a nested route it drops",
    before: [
      {
        name: "users",
        path: "/users",
        children: [{ name: "view", path: "/:id" }],
      },
    ],
    batch: [{ name: "x", path: "/x/:id", forwardTo: "users.view" }],
    plugin: `[router.addRoute] forwardTo target "users.view" does not exist for route "x"`,
    bare: ACCEPTED,
  },
  {
    what: "keeps a forward target and gives it a param the source lacks",
    before: [
      { name: "home", path: "/" },
      { name: "target", path: "/target" },
    ],
    batch: [
      { name: "target", path: "/target/:id" },
      { name: "x", path: "/x", forwardTo: "target" },
    ],
    plugin: `[router.addRoute] forwardTo target "target" requires params [id] that are not available in source route "x"`,
    bare: ACCEPTED,
  },
  {
    // The root survives `replace`, so a check that reads it still applies.
    what: "declares an absolute path under a parameterised root",
    before: [{ name: "home", path: "/" }],
    batch: [{ name: "x", path: "~x" }],
    rootPath: "/:lang",
    plugin: `[router.addRoute] Absolute path "~x" cannot be used under parent route with URL parameters`,
    bare: ACCEPTED,
  },
  {
    what: "duplicates a name inside itself",
    before: [{ name: "home", path: "/" }],
    batch: [
      { name: "a", path: "/a" },
      { name: "a", path: "/b" },
    ],
    plugin: `[router.addRoute] Duplicate route "a" in batch`,
    bare: `[router.addRoute] Duplicate route "a" in batch`,
  },
];

function verdict(run: () => void): string {
  try {
    run();

    return ACCEPTED;
  } catch (error) {
    return (error as Error).message;
  }
}

function routerOver(
  routes: readonly Route[],
  withPlugin: boolean,
  rootPath: string | undefined,
): Router {
  const router = createRouter([...routes]);

  if (rootPath !== undefined) {
    getPluginApi(router).setRootPath(rootPath);
  }

  if (withPlugin) {
    router.usePlugin(validationPlugin());
  }

  return router;
}

describe("replace() judges its batch as the whole new table (#2562)", () => {
  it.each(ROWS)(
    "a batch that $what: replace answers as add answers into an empty router",
    ({ before, batch, rootPath, plugin, bare }) => {
      const replaced = verdict(() => {
        getRoutesApi(routerOver(before, true, rootPath)).replace([...batch]);
      });
      const reference = verdict(() => {
        getRoutesApi(routerOver([], true, rootPath)).add([...batch]);
      });
      const bareReplaced = verdict(() => {
        getRoutesApi(routerOver(before, false, rootPath)).replace([...batch]);
      });

      expect({ replaced, reference, bareReplaced }).toStrictEqual({
        replaced: plugin,
        reference: plugin,
        bareReplaced: bare,
      });
    },
  );
});

/**
 * WHEN a batch door reads the table it judges against.
 *
 * ⚑ The root is the one part of it `replace` keeps, and it can change after the
 * plugin is installed. And the check runs application code before it reads the
 * table: the plugin reads a route function's text to tell an async one apart,
 * so a `toString` of the application's own runs inside the check. Read before
 * that code, the table can be one the router no longer holds.
 */
describe("a batch door reads the table when it judges the batch (#2562)", () => {
  const ABSOLUTE_UNDER_PARAMS = `[router.addRoute] Absolute path "~x" cannot be used under parent route with URL parameters`;

  const DOORS = [
    {
      door: "replace",
      run: (router: Router, batch: Route[]) => {
        getRoutesApi(router).replace(batch);
      },
    },
    {
      door: "add",
      run: (router: Router, batch: Route[]) => {
        getRoutesApi(router).add(batch);
      },
    },
  ] as const;

  it.each(DOORS)(
    "$door reads a root set after the plugin was installed",
    ({ run }) => {
      const router = routerOver([{ name: "home", path: "/" }], true, undefined);

      getPluginApi(router).setRootPath("/:lang");

      expect(
        verdict(() => {
          run(router, [{ name: "x", path: "~x" }]);
        }),
      ).toBe(ABSOLUTE_UNDER_PARAMS);
    },
  );

  it.each(DOORS)(
    "$door reads a root set by the batch's own function during the check",
    ({ run }) => {
      const router = routerOver([{ name: "home", path: "/" }], true, undefined);
      const identity: NonNullable<Route["decodeParams"]> = (channels) =>
        channels;
      const decodeParams = Object.assign(identity, {
        toString: () => {
          getPluginApi(router).setRootPath("/:lang");

          return "(channels) => channels";
        },
      });

      expect(
        verdict(() => {
          run(router, [{ name: "x", path: "~x", decodeParams }]);
        }),
      ).toBe(ABSOLUTE_UNDER_PARAMS);
    },
  );
});
