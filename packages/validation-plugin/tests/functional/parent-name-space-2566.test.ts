import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Route, Router } from "@real-router/core";

/**
 * `add(batch, { parent })` judges the batch in the table's name space (#2566).
 *
 * Under `{ parent: "p" }` a batch route `c` is the table's `p.c`, and a
 * `forwardTo` names a route by that full name. The reference for every row is
 * `p` declared again with its children and the batch appended, in one nested
 * `add` over the same table without `p` — the spelling whose names are full by
 * construction.
 *
 * ⚑ **A cell pins all three verdicts, not only the `{ parent }` one.** Without
 * the plugin, the reference and the `{ parent }` verdict agree on every row
 * below, so a cell that compared only those two would pass on a plugin that
 * never ran. The refusals below that bare core does not make are what prove it
 * ran.
 */

const ACCEPTED = "accepted";

const P: Route = { name: "p", path: "/p" };

/** Top-level routes `${prefix}0 → … → ${prefix}${length - 1}`, then `last`. */
const chainOf = (prefix: string, length: number, last?: string): Route[] =>
  Array.from({ length }, (_, index) => {
    const name = `${prefix}${index}`;
    const next = index + 1 < length ? `${prefix}${index + 1}` : last;

    return next === undefined
      ? { name, path: `/${name}` }
      : { name, path: `/${name}`, forwardTo: next };
  });

interface Row {
  readonly what: string;
  /** The table the batch joins; it holds the parent `p`. */
  readonly table: readonly Route[];
  /** The batch added under `{ parent: "p" }`. */
  readonly batch: readonly Route[];
  readonly rootPath?: string;
  /** The plugin's verdict, on `{ parent }` and on the reference alike. */
  readonly plugin: string;
  /** Bare core's verdict on the same `{ parent }` add. */
  readonly bare: string;
}

const ROWS: readonly Row[] = [
  {
    what: "forwards to a batch sibling",
    table: [P],
    batch: [
      { name: "c", path: "/c", forwardTo: "p.d" },
      { name: "d", path: "/d" },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards to a route nested in the batch",
    table: [P],
    batch: [
      { name: "c", path: "/c", forwardTo: "p.e.f" },
      { name: "e", path: "/e", children: [{ name: "f", path: "/f" }] },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "nests a route that forwards to its batch parent",
    table: [P],
    batch: [
      {
        name: "c",
        path: "/c",
        children: [{ name: "x", path: "/x", forwardTo: "p.c" }],
      },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "chains through a batch route into the table",
    table: [P, { name: "q", path: "/q" }],
    batch: [
      { name: "c", path: "/c", forwardTo: "p.d" },
      { name: "d", path: "/d", forwardTo: "q" },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards to a batch sibling under a parameterised parent",
    table: [{ name: "p", path: "/p/:pid" }],
    batch: [
      { name: "c", path: "/c", forwardTo: "p.d" },
      { name: "d", path: "/d" },
    ],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "chains through a batch route into the table under a parameterised root",
    table: [P, { name: "q", path: "/q" }],
    batch: [
      { name: "c", path: "/c", forwardTo: "p.d" },
      { name: "d", path: "/d", forwardTo: "q" },
    ],
    rootPath: "/:lang",
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "shares a short name with a top-level route that closes a chain",
    table: [
      { name: "c", path: "/c" },
      { name: "d", path: "/d", forwardTo: "c" },
      P,
    ],
    batch: [{ name: "c", path: "/c2", forwardTo: "d" }],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "shares a short name with a top-level route that ends a long chain",
    // Joined through a short key `c`, the two chains would run past the
    // forward depth limit.
    table: [
      { name: "c", path: "/c" },
      ...chainOf("t", 61, "c"),
      ...chainOf("u", 61),
      P,
    ],
    batch: [{ name: "c", path: "/c2", forwardTo: "u0" }],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards in a cycle inside the batch",
    table: [P],
    batch: [
      { name: "c", path: "/c", forwardTo: "p.d" },
      { name: "d", path: "/d", forwardTo: "p.c" },
    ],
    plugin: "[router] Circular forwardTo: p.c → p.d → p.c",
    bare: "[router] Circular forwardTo: p.c → p.d → p.c",
  },
  {
    what: "forwards to a batch sibling that needs a param the source lacks",
    table: [P],
    batch: [
      { name: "c", path: "/c", forwardTo: "p.d" },
      { name: "d", path: "/d/:id" },
    ],
    plugin: `[router.addRoute] forwardTo target "p.d" requires params [id] that are not available in source route "p.c"`,
    bare: ACCEPTED,
  },
  {
    what: "forwards to a table route that needs a param the source lacks",
    table: [P, { name: "q", path: "/q/:id" }],
    batch: [{ name: "c", path: "/c", forwardTo: "q" }],
    plugin: `[router.addRoute] forwardTo target "q" requires params [id] that are not available in source route "p.c"`,
    bare: ACCEPTED,
  },
  {
    what: "forwards to no route",
    table: [P],
    batch: [{ name: "c", path: "/c", forwardTo: "p.ghost" }],
    plugin: `[router.addRoute] forwardTo target "p.ghost" does not exist for route "p.c"`,
    bare: ACCEPTED,
  },
  {
    what: "spells a batch sibling by its short name",
    table: [P],
    batch: [
      { name: "c", path: "/c", forwardTo: "d" },
      { name: "d", path: "/d" },
    ],
    plugin: `[router.addRoute] forwardTo target "d" does not exist for route "p.c"`,
    bare: ACCEPTED,
  },
  {
    what: "declares a defaultParams that is not an object",
    table: [P],
    batch: [{ name: "c", path: "/c", defaultParams: [] as never }],
    plugin: `[router.addRoute] defaultParams must be an object for route "p.c", got array[0]`,
    bare: ACCEPTED,
  },
  {
    what: "declares a defaultSearch that is not an object",
    table: [P],
    batch: [{ name: "c", path: "/c", defaultSearch: 5 as never }],
    plugin: `[router.addRoute] defaultSearch must be an object for route "p.c", got number`,
    bare: ACCEPTED,
  },
  {
    what: "declares a forwardTo that is neither a string nor a function",
    table: [P],
    batch: [{ name: "c", path: "/c", forwardTo: 1 as never }],
    plugin: `[router.addRoute] forwardTo must be a string or function for route "p.c", got number`,
    bare: `[router] forwardTo must be a string or function for route "p.c", got number`,
  },
  {
    what: "declares an async decodeParams",
    table: [P],
    batch: [
      {
        name: "c",
        path: "/c",
        decodeParams: (async (params: unknown) => params) as never,
      },
    ],
    plugin: `[router.addRoute] decodeParams cannot be async for route "p.c"`,
    bare: ACCEPTED,
  },
  {
    what: "declares an async encodeParams",
    table: [P],
    batch: [
      {
        name: "c",
        path: "/c",
        encodeParams: (async (params: unknown) => params) as never,
      },
    ],
    plugin: `[router.addRoute] encodeParams cannot be async for route "p.c"`,
    bare: ACCEPTED,
  },
  {
    what: "declares an async forwardTo callback",
    table: [P],
    batch: [{ name: "c", path: "/c", forwardTo: (async () => "p") as never }],
    plugin: `[router.addRoute] forwardTo callback cannot be async for route "p.c"`,
    bare: `[router] forwardTo callback cannot be async for route "p.c". Async functions break matchPath/buildPath.`,
  },
  {
    what: "nests a route with an async decodeParams",
    table: [P],
    batch: [
      {
        name: "c",
        path: "/c",
        children: [
          {
            name: "x",
            path: "/x",
            decodeParams: (async (params: unknown) => params) as never,
          },
        ],
      },
    ],
    plugin: `[router.addRoute] decodeParams cannot be async for route "p.c.x"`,
    bare: ACCEPTED,
  },
  {
    what: "declares a route whose name is not a string",
    table: [P],
    batch: [{ name: Symbol("s") as never, path: "/s" }],
    plugin: "[router.addRoute] Route name must be a string, got symbol",
    bare: "[router.addRoute] Route name must be a string, got symbol",
  },
  {
    what: "declares a route whose name has no way to become a string",
    table: [P],
    batch: [{ name: Object.create(null) as never, path: "/o" }],
    plugin: "[router.addRoute] Route name must be a string, got object",
    bare: "[router.addRoute] Route name must be a string, got object",
  },
  {
    what: "forwards to a table route outside the parent",
    table: [P, { name: "q", path: "/q" }],
    batch: [{ name: "c", path: "/c", forwardTo: "q" }],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards to a child the parent already holds",
    table: [{ name: "p", path: "/p", children: [{ name: "d0", path: "/d0" }] }],
    batch: [{ name: "c", path: "/c", forwardTo: "p.d0" }],
    plugin: ACCEPTED,
    bare: ACCEPTED,
  },
  {
    what: "forwards to a table route that needs the parent's param",
    table: [
      { name: "p", path: "/p/:pid" },
      { name: "q", path: "/q/:pid" },
    ],
    batch: [{ name: "c", path: "/c", forwardTo: "q" }],
    plugin: ACCEPTED,
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

/** The batch declared as `p`'s children, over the table without `p`. */
function addNested(
  table: readonly Route[],
  batch: readonly Route[],
  rootPath: string | undefined,
): void {
  const parent = table.find((route) => route.name === "p");
  const rest = table.filter((route) => route.name !== "p");

  getRoutesApi(routerOver(rest, true, rootPath)).add([
    { ...parent!, children: [...(parent!.children ?? []), ...batch] },
  ]);
}

describe("add(batch, { parent }) judges the batch in the table's name space (#2566)", () => {
  it.each(ROWS)(
    "a batch that $what: { parent } answers as the nested spelling does",
    ({ table, batch, rootPath, plugin, bare }) => {
      const underParent = verdict(() => {
        getRoutesApi(routerOver(table, true, rootPath)).add([...batch], {
          parent: "p",
        });
      });
      const nested = verdict(() => {
        addNested(table, batch, rootPath);
      });
      const bareUnderParent = verdict(() => {
        getRoutesApi(routerOver(table, false, rootPath)).add([...batch], {
          parent: "p",
        });
      });

      expect({ underParent, nested, bareUnderParent }).toStrictEqual({
        underParent: plugin,
        nested: plugin,
        bareUnderParent: bare,
      });
    },
  );
});

describe("the callback walk names a route only by names a table can hold (#2566)", () => {
  // The walk runs before the parent option and the names are judged, so its
  // refusal comes first and names the route from what it has at that point.
  const asyncChild = (name: string): Route => ({
    name,
    path: `/${name}`,
    decodeParams: (async (params: unknown) => params) as never,
  });

  it.each([
    { what: "is not a string", parent: Symbol("p") },
    { what: "names no route of the table", parent: "ghost" },
  ])("a parent option that $what is not joined to the name", ({ parent }) => {
    const router = routerOver([P], true, undefined);

    expect(
      verdict(() => {
        getRoutesApi(router).add([asyncChild("c")], {
          parent: parent as never,
        });
      }),
    ).toBe(`[router.addRoute] decodeParams cannot be async for route "c"`);
  });

  it("a batch route with an empty name adds nothing to its child's name", () => {
    const router = routerOver([], true, undefined);

    expect(
      verdict(() => {
        getRoutesApi(router).add([
          { name: "", path: "/e", children: [asyncChild("x")] },
        ]);
      }),
    ).toBe(`[router.addRoute] decodeParams cannot be async for route "x"`);
  });
});
