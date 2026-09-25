import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Route, Router } from "@real-router/core";

/**
 * A forward's param check reads each end's params by core's grammar (#2569).
 *
 * The check refuses a forward whose target needs a param its source does not
 * hold. A route already in the table is read through `getUrlParams`, which is
 * core's own reading of its path; a route of the batch is read from its path.
 * Both ends have to be read the same way, or a param name core accepts is seen
 * as two different names.
 *
 * ⚑ **A cell pins bare core's verdict next to the plugin's.** Bare core checks no
 * params, so it accepts every row below; the refusals it does not make are what
 * prove the plugin ran.
 */

const ACCEPTED = "accepted";

interface Row {
  readonly what: string;
  /** The routes the router starts with. */
  readonly table: readonly Route[];
  /** The door the row goes through. */
  readonly act: (router: Router) => void;
  readonly plugin: string;
  readonly bare: string;
}

const add =
  (batch: readonly Route[], parent?: string) =>
  (router: Router): void => {
    getRoutesApi(router).add(
      [...batch],
      parent === undefined ? undefined : { parent },
    );
  };

const refused = (target: string, params: string, source: string): string =>
  `[router.addRoute] forwardTo target "${target}" requires params [${params}] that are not available in source route "${source}"`;

const ROWS: readonly Row[] = [
  {
    what: "forwards from a kebab-case param to the table route that has it",
    table: [{ name: "q", path: "/q/:user-id" }],
    act: add([{ name: "c", path: "/c/:user-id", forwardTo: "q" }]),
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards from a non-ASCII param to the table route that has it",
    table: [{ name: "q", path: "/q/:ид" }],
    act: add([{ name: "c", path: "/c/:ид", forwardTo: "q" }]),
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards from a param named from a digit to the table route that has it",
    table: [{ name: "q", path: "/q/:1d" }],
    act: add([{ name: "c", path: "/c/:1d", forwardTo: "q" }]),
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards from a kebab-case splat to the table route that has it",
    table: [{ name: "q", path: "/q/*rest-of" }],
    act: add([{ name: "c", path: "/c/*rest-of", forwardTo: "q" }]),
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "nests a route under a kebab-case param, forwarding to the table route that has it",
    table: [{ name: "q", path: "/q/:user-id" }],
    act: add([
      {
        name: "p",
        path: "/p/:user-id",
        children: [{ name: "c", path: "/c", forwardTo: "q" }],
      },
    ]),
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "under { parent }, forwards from a kebab-case param to a child of the parent that has it",
    table: [
      {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:user-id" }],
      },
    ],
    act: add(
      [
        {
          name: "legacy",
          path: "/legacy/:user-id",
          forwardTo: "users.profile",
        },
      ],
      "users",
    ),
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards to a batch route whose kebab-case param the source holds a word prefix of",
    table: [],
    act: add([
      { name: "c", path: "/c/:user", forwardTo: "d" },
      { name: "d", path: "/d/:user-id" },
    ]),
    plugin: refused("d", "user-id", "c"),
    bare: ACCEPTED,
  },
  {
    what: "forwards to a batch route whose kebab-case splat the source holds a word prefix of",
    table: [],
    act: add([
      { name: "c", path: "/c/:rest", forwardTo: "d" },
      { name: "d", path: "/d/*rest-of" },
    ]),
    plugin: refused("d", "rest-of", "c"),
    bare: ACCEPTED,
  },
  {
    what: "replaces the table with a forward to a kebab-case param the source holds a word prefix of",
    table: [],
    act: (router) => {
      getRoutesApi(router).replace([
        { name: "c", path: "/c/:user", forwardTo: "d" },
        { name: "d", path: "/d/:user-id" },
      ]);
    },
    // Both batch doors report `addRoute` by decision (#2399's table).
    plugin: refused("d", "user-id", "c"),
    bare: ACCEPTED,
  },
  {
    what: "forwards from a query declaration `?:x` to a batch route whose path needs x",
    table: [],
    act: add([
      { name: "c", path: "/c?:x", forwardTo: "d" },
      { name: "d", path: "/d/:x" },
    ]),
    plugin: refused("d", "x", "c"),
    bare: ACCEPTED,
  },
  {
    what: "forwards from a query declaration `?x` to a batch route whose path needs x",
    table: [],
    act: add([
      { name: "c", path: "/c?x", forwardTo: "d" },
      { name: "d", path: "/d/:x" },
    ]),
    plugin: refused("d", "x", "c"),
    bare: ACCEPTED,
  },
  {
    what: "forwards to a batch route whose non-ASCII param the source lacks",
    table: [],
    act: add([
      { name: "c", path: "/c", forwardTo: "d" },
      { name: "d", path: "/d/:ид" },
    ]),
    plugin: refused("d", "ид", "c"),
    bare: ACCEPTED,
  },
  {
    what: "forwards from a kebab-case param to a table route whose param is its word prefix",
    table: [{ name: "q", path: "/q/:user" }],
    act: add([{ name: "c", path: "/c/:user-id", forwardTo: "q" }]),
    plugin: refused("q", "user", "c"),
    bare: ACCEPTED,
  },
  {
    what: "forwards between two kebab-case params that share a word prefix",
    table: [],
    act: add([
      { name: "c", path: "/c/:user-name", forwardTo: "d" },
      { name: "d", path: "/d/:user-id" },
    ]),
    plugin: refused("d", "user-id", "c"),
    bare: ACCEPTED,
  },
  {
    what: "forwards from a query declaration `?q&:r` to a batch route whose path needs r",
    table: [],
    act: add([
      { name: "c", path: "/c?q&:r", forwardTo: "d" },
      { name: "d", path: "/d/:r" },
    ]),
    plugin: refused("d", "r", "c"),
    bare: ACCEPTED,
  },
  {
    what: "forwards to a batch route whose query declaration `?:x` needs no path param",
    table: [],
    act: add([
      { name: "c", path: "/c", forwardTo: "d" },
      { name: "d", path: "/d?:x" },
    ]),
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "CONTROL: forwards from a word-named param to the table route that has it",
    table: [{ name: "q", path: "/q/:userId" }],
    act: add([{ name: "c", path: "/c/:userId", forwardTo: "q" }]),
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "CONTROL: forwards to a batch route whose word-named param the source lacks",
    table: [],
    act: add([
      { name: "c", path: "/c/:user", forwardTo: "d" },
      { name: "d", path: "/d/:userId" },
    ]),
    plugin: refused("d", "userId", "c"),
    bare: ACCEPTED,
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

function routerOver(routes: readonly Route[], withPlugin: boolean): Router {
  const router = createRouter([...routes]);

  if (withPlugin) {
    router.usePlugin(validationPlugin());
  }

  return router;
}

describe("a forward's param check reads each end's params by core's grammar (#2569)", () => {
  it.each(ROWS)(
    "a batch that $what gets the verdict core's reading of its params implies",
    ({ table, act, plugin, bare }) => {
      expect({
        plugin: verdict(() => {
          act(routerOver(table, true));
        }),
        bare: verdict(() => {
          act(routerOver(table, false));
        }),
      }).toStrictEqual({ plugin, bare });
    },
  );
});
