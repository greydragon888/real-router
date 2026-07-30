import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import { arbSegmentName, NUM_RUNS } from "./helpers";

import type {
  ParamsSearch,
  Route,
  RouteConfigUpdate,
  Router,
  TreeChangedEvent,
} from "@real-router/core";

// =============================================================================
// Helpers (module scope — keep property bodies branch-free)
// =============================================================================

const byName = (a: string, b: string): number => a.localeCompare(b);

function makeRouter(extra: readonly string[] = []): Router {
  const routes: Route[] = [
    { name: "home", path: "/" },
    ...extra.map((name) => ({ name, path: `/${name}` })),
  ];

  return createRouter(routes, { defaultRoute: "home" });
}

function collect(router: Router): TreeChangedEvent[] {
  const events: TreeChangedEvent[] = [];

  getRoutesApi(router).subscribeChanges((event) => events.push(event));

  return events;
}

function addedNames(event: TreeChangedEvent | undefined): string[] {
  if (event === undefined) {
    return [];
  }

  if (event.op === "add" || event.op === "replace") {
    return event.added.map((route) => route.name);
  }

  return [];
}

function removedNames(event: TreeChangedEvent | undefined): string[] {
  if (event === undefined) {
    return [];
  }

  if (event.op === "replace" || event.op === "clear") {
    return event.removed.map((route) => route.name);
  }

  if (event.op === "remove") {
    return event.removedSubtree.map((route) => route.name);
  }

  return [];
}

function patchKeys(event: TreeChangedEvent | undefined): string[] {
  return event?.op === "update" ? Object.keys(event.patch) : [];
}

const STRUCTURAL_FIELDS = [
  "forwardTo",
  "defaultParams",
  "encodeParams",
  "decodeParams",
] as const;

const GUARD_FIELDS = ["canActivate", "canDeactivate"] as const;

/** Builds an `update` patch from chosen structural + guard field subsets. */
function buildPatch(
  structural: readonly string[],
  guard: readonly string[],
): RouteConfigUpdate {
  const patch: RouteConfigUpdate = {};

  if (structural.includes("forwardTo")) {
    patch.forwardTo = "home";
  }
  if (structural.includes("defaultParams")) {
    patch.defaultParams = { x: "1" };
  }
  if (structural.includes("encodeParams")) {
    patch.encodeParams = ({ params, search }: ParamsSearch) => ({
      params,
      search,
    });
  }
  if (structural.includes("decodeParams")) {
    patch.decodeParams = ({ params, search }: ParamsSearch) => ({
      params,
      search,
    });
  }
  if (guard.includes("canActivate")) {
    patch.canActivate = () => () => true;
  }
  if (guard.includes("canDeactivate")) {
    patch.canDeactivate = () => () => true;
  }

  return patch;
}

const toRoutes = (names: readonly string[]): Route[] =>
  names.map((name) => ({ name, path: `/${name}` }));

// Unique segment names that never collide with the seed routes.
const arbFreshNames = (max: number): fc.Arbitrary<string[]> =>
  fc
    .uniqueArray(arbSegmentName, { minLength: 0, maxLength: max })
    .filter((names) => !names.includes("home") && !names.includes("seed"));

// =============================================================================
// Property 1 — atomicity (one CRUD call = one event)
// =============================================================================

describe("TREE_CHANGED Properties — atomicity", () => {
  test.prop([arbFreshNames(8).filter((n) => n.length > 0)], {
    numRuns: NUM_RUNS.standard,
  })(
    "one add(array) call emits exactly one event regardless of batch size",
    (names) => {
      const router = makeRouter();
      const events = collect(router);

      getRoutesApi(router).add(toRoutes(names));

      expect(events).toHaveLength(1);
      expect(events[0].op).toBe("add");
      expect(addedNames(events[0]).toSorted(byName)).toStrictEqual(
        [...names].toSorted(byName),
      );
    },
  );

  test.prop([arbFreshNames(10)], { numRuns: NUM_RUNS.standard })(
    "N sequential add calls emit exactly N events",
    (names) => {
      const router = makeRouter();
      const events = collect(router);
      const routes = getRoutesApi(router);

      for (const name of names) {
        routes.add({ name, path: `/${name}` });
      }

      expect(events).toHaveLength(names.length);
      expect(events.map((event) => event.op)).toStrictEqual(
        names.map(() => "add"),
      );
    },
  );
});

// =============================================================================
// Property 2 — op discriminator integrity
// =============================================================================

describe("TREE_CHANGED Properties — op discriminator", () => {
  const arbOp = fc.constantFrom("add", "remove", "update", "replace", "clear");

  test.prop([arbOp, arbSegmentName], { numRuns: NUM_RUNS.standard })(
    "event.op strictly equals the invoking method",
    (op, name) => {
      fc.pre(name !== "home" && name !== "seed");

      const router = makeRouter(["seed"]);
      const events = collect(router);
      const routes = getRoutesApi(router);

      switch (op) {
        case "add": {
          routes.add({ name, path: `/${name}` });

          break;
        }
        case "remove": {
          routes.remove("seed");

          break;
        }
        case "update": {
          routes.update("seed", { forwardTo: "home" });

          break;
        }
        case "replace": {
          routes.replace([{ name: "home", path: "/" }]);

          break;
        }
        default: {
          routes.clear();
        }
      }

      expect(events).toHaveLength(1);
      expect(events[0].op).toBe(op);
    },
  );
});

// =============================================================================
// Property 3 — replace diff correctness + idempotency
// =============================================================================

describe("TREE_CHANGED Properties — replace diff", () => {
  test.prop([arbFreshNames(8), arbFreshNames(8)], {
    numRuns: NUM_RUNS.standard,
  })(
    "replace diff: removed = old minus new, added = new minus old (by name)",
    (oldNames, newNames) => {
      const router = makeRouter(oldNames);
      const events = collect(router);
      const routes = getRoutesApi(router);

      // "home" is in both sets, so it is never in removed/added.
      const newRoutes = toRoutes(["home", ...newNames]);

      routes.replace(newRoutes);

      const event = events.at(-1);

      expect(event?.op).toBe("replace");

      const newSet = new Set(newNames);
      const oldSet = new Set(oldNames);

      expect(removedNames(event).toSorted(byName)).toStrictEqual(
        oldNames.filter((name) => !newSet.has(name)).toSorted(byName),
      );
      expect(addedNames(event).toSorted(byName)).toStrictEqual(
        newNames.filter((name) => !oldSet.has(name)).toSorted(byName),
      );

      // Idempotency: replacing with the identical set yields an empty diff.
      routes.replace(newRoutes);

      const second = events.at(-1);

      expect(removedNames(second)).toHaveLength(0);
      expect(addedNames(second)).toHaveLength(0);
    },
  );
});

// =============================================================================
// Property 4 — nested subtree flattening (descendants by full dotted name)
// =============================================================================

describe("TREE_CHANGED Properties — nested subtree flattening", () => {
  test.prop(
    [
      arbSegmentName,
      fc.uniqueArray(arbSegmentName, { minLength: 1, maxLength: 4 }),
      fc.uniqueArray(arbSegmentName, { minLength: 0, maxLength: 3 }),
    ],
    { numRuns: NUM_RUNS.fast },
  )(
    "add/remove of a nested subtree carry every descendant, flat, by full name",
    (parent, children, grandchildren) => {
      fc.pre(parent !== "home");

      const tree: Route = {
        name: parent,
        path: `/${parent}`,
        children: children.map((child) => ({
          name: child,
          path: `/${child}`,
          children: grandchildren.map((g) => ({ name: g, path: `/${g}` })),
        })),
      };

      const expected = [
        parent,
        ...children.map((child) => `${parent}.${child}`),
        ...children.flatMap((child) =>
          grandchildren.map((g) => `${parent}.${child}.${g}`),
        ),
      ].toSorted(byName);

      const router = makeRouter();
      const events = collect(router);
      const routes = getRoutesApi(router);

      // collectAddedRoutes flattening
      routes.add(tree);

      expect(events.at(-1)?.op).toBe("add");
      expect(addedNames(events.at(-1)).toSorted(byName)).toStrictEqual(
        expected,
      );

      // collectSubtree flattening
      routes.remove(parent);

      expect(events.at(-1)?.op).toBe("remove");
      expect(removedNames(events.at(-1)).toSorted(byName)).toStrictEqual(
        expected,
      );
    },
  );
});

// =============================================================================
// Property 5 — update conditional emission (О-7: structural-only)
// =============================================================================

describe("TREE_CHANGED Properties — update conditional emission", () => {
  test.prop(
    [fc.subarray([...STRUCTURAL_FIELDS]), fc.subarray([...GUARD_FIELDS])],
    {
      numRuns: NUM_RUNS.standard,
    },
  )(
    "update emits iff a structural field is present; payload is structural-only",
    (structural, guard) => {
      const router = makeRouter(["seed"]);
      const events = collect(router);

      getRoutesApi(router).update("seed", buildPatch(structural, guard));

      // One event iff at least one structural field was in the patch.
      expect(events).toHaveLength(Math.min(structural.length, 1));

      // The emitted patch contains exactly the structural keys (guards filtered).
      expect(patchKeys(events.at(-1)).toSorted(byName)).toStrictEqual(
        [...structural].toSorted(byName),
      );
    },
  );
});
