import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getLifecycleApi,
  getRoutesApi,
} from "@real-router/core/api";

import type { Route } from "@real-router/core/types";

/**
 * A route whose NAME shadows an `Object.prototype` member must get the same
 * guard treatment as any other route, through every door (#1801).
 *
 * `RouteLifecycleNamespace` keeps its factories in `Map`s and copies them out
 * into plain `{}` records keyed by route name — two in `getFactories()`, four
 * in `getFactoriesByOrigin()`. A plain object inherits twelve members, and the
 * two consumers of those records read them in DIFFERENT ways, so the same
 * defect surfaces twice over:
 *
 *   read BY KEY   `getRoutesApi.ts` asks `name in canDeactivateFactories`,
 *                 which walks the chain → `get(name)` reports a `canDeactivate`
 *                 nobody registered, and so does the TREE_CHANGED payload
 *                 plugins reconcile from.
 *   ENUMERATE     `cloneRouter` re-registers via `Object.entries(...)`. The
 *                 `"__proto__"` write left ZERO own keys, so the loop iterates
 *                 nothing and the clone LOSES a blocking `canActivate` — it
 *                 navigates to a route the base refuses.
 *
 * Measured before the fix, one blocking `canActivate`, both origins:
 *
 *   name             get() can*                        base            clone
 *   __proto__        canActivate, canDeactivate        blocked         LANDED
 *   toString         canActivate, canDeactivate        blocked         blocked
 *   ordinary         canActivate                       blocked         blocked
 *
 * `Object.create(null)` for the six records closes the write, the `in` read and
 * the enumeration at once — the discipline the rest of this layer already uses
 * (all six `RouteConfig` maps, `routeCustomFields`, the trie's staticChildren).
 */

/** Every own member of `Object.prototype` that is a plausible route name. */
const SHADOWING = [
  "__proto__",
  "toString",
  "constructor",
  "valueOf",
  "hasOwnProperty",
] as const;

const CONTROL = "ordinary";

const guardKeys = (route: unknown): string[] =>
  Object.keys(route ?? {})
    .filter((key) => key.startsWith("can"))
    .toSorted((left, right) => left.localeCompare(right));

/** A router with ONE blocking `canActivate` on `name`, registered by `origin`. */
const withGuard = async (
  name: string,
  origin: "definition" | "external",
): Promise<ReturnType<typeof createRouter>> => {
  const definition: Record<string, unknown> = { name, path: "/p" };

  if (origin === "definition") {
    definition.canActivate = () => () => false;
  }

  const router = createRouter([
    definition,
    { name: "home", path: "/home" },
  ] as Route[]);

  if (origin === "external") {
    getLifecycleApi(router).addActivateGuard(name, () => () => false);
  }

  await router.start("/home");

  return router;
};

describe("guard-factory records keyed by a route name (#1801)", () => {
  it("the shadowing-name list is non-empty and carries the accessor", () => {
    // Non-vacuity for the table itself: `it.each([])` registers zero cells in
    // silence, and `__proto__` is the ONLY member that reaches the enumerate
    // half — a list without it exercises the read half alone.
    expect(SHADOWING.length).toBeGreaterThan(3);
    expect(SHADOWING).toContain("__proto__");
  });

  describe.each(["definition", "external"] as const)("origin: %s", (origin) => {
    it.each([...SHADOWING])(
      "get(%s) reports only the guard that was registered",
      async (name) => {
        const router = await withGuard(name, origin);
        const control = await withGuard(CONTROL, origin);
        const baseline = guardKeys(getRoutesApi(control).get(CONTROL));

        // Non-vacuity: two EMPTY lists compare equal, so a door answering
        // `undefined` for every route would satisfy the comparison below while
        // proving nothing.
        expect(baseline.length).toBeGreaterThan(0);

        expect(guardKeys(getRoutesApi(router).get(name))).toStrictEqual(
          baseline,
        );
      },
    );

    it.each([...SHADOWING])(
      "the TREE_CHANGED payload for %s reports only the registered guard",
      async (name) => {
        const read = async (routeName: string): Promise<string[]> => {
          const router = createRouter([{ name: "home", path: "/home" }]);
          const api = getRoutesApi(router);

          getLifecycleApi(router).addActivateGuard(
            routeName,
            () => () => false,
          );

          let seen: string[] = [];
          const off = api.subscribeChanges((event) => {
            if (event.op === "add") {
              seen = guardKeys(event.added[0]);
            }
          });

          api.add([{ name: routeName, path: "/p" }] as Route[]);
          off();

          return seen;
        };

        const baseline = await read(CONTROL);

        // Non-vacuity: two EMPTY lists compare equal, so a door that answers
        // `undefined` for every route would satisfy the comparison below
        // while proving nothing. The control must actually carry a guard.
        expect(baseline.length).toBeGreaterThan(0);

        await expect(read(name)).resolves.toStrictEqual(baseline);
      },
    );

    it.each([...SHADOWING])(
      "get(%s) round-trips back through add()",
      async (name) => {
        const router = await withGuard(name, origin);
        const config = getRoutesApi(router).get(name);
        const fresh = createRouter([{ name: "home", path: "/home" }]);

        expect(() => {
          getRoutesApi(fresh).add([config!]);
        }).not.toThrow();
      },
    );

    it.each([...SHADOWING])(
      "cloneRouter carries the blocking guard on %s",
      async (name) => {
        const router = await withGuard(name, origin);
        const clone = cloneRouter(router);

        await clone.start("/home");

        // The base refuses; the clone must refuse identically.
        const base = await router.navigate(name).then(
          (state) => `landed:${state.name}`,
          () => "blocked",
        );
        const cloned = await clone.navigate(name).then(
          (state) => `landed:${state.name}`,
          () => "blocked",
        );

        expect(cloned).toBe(base);
      },
    );
  });

  it("the control route is unaffected on every door", async () => {
    const router = await withGuard(CONTROL, "external");

    expect(guardKeys(getRoutesApi(router).get(CONTROL))).toStrictEqual([
      "canActivate",
    ]);
  });

  /**
   * The phantom appears in the record that has NO own entry for the name, so a
   * route with only a `canDeactivate` is what exercises the ACTIVATE record —
   * and vice versa. Mutating each of the six containers proved this: with an
   * activate guard alone, four of them are never asked a question they could
   * answer wrongly.
   */
  it.each([...SHADOWING])(
    "a %s route with only a canDeactivate reports no phantom canActivate",
    async (name) => {
      const read = async (routeName: string): Promise<string[]> => {
        const router = createRouter([
          { name: routeName, path: "/p" },
          { name: "home", path: "/home" },
        ] as Route[]);

        getLifecycleApi(router).addDeactivateGuard(routeName, () => () => true);
        await router.start("/home");

        return guardKeys(getRoutesApi(router).get(routeName));
      };

      const baseline = await read(CONTROL);

      // Non-vacuity: two EMPTY lists compare equal, so a door that answers
      // `undefined` for every route would satisfy the comparison below
      // while proving nothing. The control must actually carry a guard.
      expect(baseline.length).toBeGreaterThan(0);

      await expect(read(name)).resolves.toStrictEqual(baseline);
    },
  );

  it.each(
    (["definition", "external"] as const).flatMap((origin) =>
      SHADOWING.map((name) => [origin, name] as const),
    ),
  )(
    "cloneRouter carries a %s-origin canDeactivate on %s",
    async (guardOrigin, name) => {
      const build = async (
        routeName: string,
      ): Promise<ReturnType<typeof createRouter>> => {
        // Blocking deactivate: once ON the route, leaving must be refused.
        // The ORIGIN decides which of the four records `cloneRouter`
        // enumerates, so both are exercised.
        const definition: Record<string, unknown> = {
          name: routeName,
          path: "/p",
        };

        if (guardOrigin === "definition") {
          definition.canDeactivate = () => () => false;
        }

        const router = createRouter([
          definition,
          { name: "home", path: "/home" },
        ] as Route[]);

        if (guardOrigin === "external") {
          getLifecycleApi(router).addDeactivateGuard(
            routeName,
            () => () => false,
          );
        }

        await router.start("/p");

        return router;
      };

      const outcome = async (
        router: ReturnType<typeof createRouter>,
      ): Promise<string> =>
        router.navigate("home").then(
          () => "left",
          () => "blocked",
        );

      const base = await build(name);
      const clone = cloneRouter(base);

      await clone.start("/p");

      await expect(outcome(clone)).resolves.toBe(await outcome(base));
    },
  );

  /**
   * Class-guard. The defect is not "guards"; it is "a container keyed by a
   * ROUTE NAME was built as a plain `{}`". Every other such container in this
   * layer — the six `RouteConfig` maps — is already `Object.create(null)`, and
   * this asserts the whole set together: a route named after an
   * `Object.prototype` member must report EXACTLY the config it was given,
   * field for field, through the read door. Reverting any one of the seven
   * containers to `{}` reds this.
   */
  it.each([...SHADOWING])(
    "a route named %s reports no config field it was never given",
    async (name) => {
      const fields = [
        "defaultParams",
        "defaultSearch",
        "encodeParams",
        "decodeParams",
        "forwardTo",
        "canActivate",
        "canDeactivate",
      ] as const;

      const read = async (routeName: string): Promise<string[]> => {
        const router = await withGuard(routeName, "external");
        const config = getRoutesApi(router).get(routeName) as Record<
          string,
          unknown
        >;

        return fields.filter((field) => config[field] !== undefined);
      };

      // Same declaration, same registered guard — only the NAME differs.
      const baseline = await read(CONTROL);

      // Non-vacuity: two EMPTY lists compare equal, so a door that answers
      // `undefined` for every route would satisfy the comparison below
      // while proving nothing. The control must actually carry a guard.
      expect(baseline.length).toBeGreaterThan(0);

      await expect(read(name)).resolves.toStrictEqual(baseline);
    },
  );
});
