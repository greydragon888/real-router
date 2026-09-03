import { beforeEach, describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";
import type { Params, SearchParams } from "@real-router/core/types";

/**
 * INVARIANTS row 7 — *href equals destination* — with an INJECTING PLUGIN
 * installed (#2087).
 *
 * ⚑ The property that owns this invariant runs on bare core
 * (`tests/property/searchPathConsistency.properties.ts` block 8): the file
 * registers no plugin and no interceptor, so it cannot reach the shape below.
 * The two injection seams sit on opposite sides of the route-default merge, and
 * that difference is invisible until something injects.
 *
 * ⚠ A route `defaultSearch` is the discriminator, and it is legal configuration.
 * Without it both doors agree, which is the control every cell here carries —
 * a fixture that rots would otherwise pass by answering the same wrong thing
 * twice.
 */
describe("href equals destination with a plugin injecting (#2087)", () => {
  /**
   * What `persistent-params` does, without the dependency: inject a stored
   * query value on BOTH seams, letting the caller's own value win. The
   * `{ [key]: value, ...incoming }` spread IS `mergeParams(stored, incoming)`.
   */
  function installInjector(router: Router, key: string, value: string): void {
    const api = getPluginApi(router);

    api.addInterceptor("forwardState", (next, name, params, search) => {
      const forwarded = next(name, params, search);

      return {
        ...forwarded,
        search: { [key]: value, ...forwarded.search },
      };
    });

    api.addInterceptor("buildPath", (next, route, params, search) =>
      next(route, params, {
        [key]: value,
        ...search,
      }),
    );
  }

  const withDefault = [
    { name: "home", path: "/" },
    { name: "list", path: "/list?page&q", defaultSearch: { page: "1" } },
  ];
  const withoutDefault = [
    { name: "home", path: "/" },
    { name: "list", path: "/list?page&q" },
  ];

  let router: Router;

  const start = async (routes: typeof withDefault): Promise<Router> => {
    router = createRouter(routes);
    installInjector(router, "page", "7");
    await router.start("/");

    return router;
  };

  beforeEach(() => {
    router = undefined as unknown as Router;
  });

  const bothDoors = async (
    search: SearchParams | undefined,
  ): Promise<{ href: string; destination: string }> => ({
    href: router.buildPath("list", {}, search),
    destination: await router
      .navigate("list", {}, search)
      .then((state) => state.path),
  });

  it("the caller omits the key and the route defaults it — the two doors agree", async () => {
    await start(withDefault);

    const { href, destination } = await bothDoors({ q: "x" });

    expect(href).toBe(destination);
    // …and on the value the injector supplied, not the route default: the
    // answer is the positive control, so a fixture that stopped injecting
    // fails here rather than passing on `/list?page=1&q=x` twice.
    expect(href).toBe("/list?page=7&q=x");
  });

  it("CONTROL — the same route without a defaultSearch agrees today", async () => {
    await start(withoutDefault);

    const { href, destination } = await bothDoors({ q: "x" });

    expect(href).toBe(destination);
    expect(href).toBe("/list?page=7&q=x");
  });

  it("CONTROL — a caller who names the key keeps it, on both doors", async () => {
    await start(withDefault);

    const { href, destination } = await bothDoors({ page: "3", q: "x" });

    expect(href).toBe(destination);
    expect(href).toBe("/list?page=3&q=x");
  });

  it("CONTROL — a caller naming the key with the DEFAULT's own value keeps it", async () => {
    await start(withDefault);

    const { href, destination } = await bothDoors({ page: "1", q: "x" });

    expect(href).toBe(destination);
    expect(href).toBe("/list?page=1&q=x");
  });

  it("the caller names no query channel at all — the arm every <Link> takes", async () => {
    await start(withDefault);

    const { href, destination } = await bothDoors(undefined);

    expect(href).toBe(destination);
  });

  it("normalises a params bag the door's interceptor dropped to `undefined`", () => {
    // The same net the navigate door carries over its own seam: the declared
    // type says `params: Params`, and an interceptor spreading a PARTIAL result
    // leaves the slot empty. The door answers rather than throwing.
    router = createRouter(withDefault);
    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        const forwarded = next(name, params, search);

        return {
          name: forwarded.name,
          search: forwarded.search,
        } as unknown as ReturnType<typeof next>;
      },
    );

    expect(router.buildPath("list", {}, { q: "x" })).toBe("/list?page=1&q=x");
  });

  it("an own `__proto__` from the door's interceptor never reaches the URL", () => {
    // The door runs no output sanitiser of its own — `canonicalize`'s
    // `normalizeChannel` drops the key on both channels. This cell is what makes
    // that a pin rather than a claim in the door's docblock.
    router = createRouter(withDefault);
    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        const forwarded = next(name, params, search);
        const poison = (bag: object): Record<string, unknown> => {
          const copy: Record<string, unknown> = { ...bag };

          Object.defineProperty(copy, "__proto__", {
            value: "polluted",
            enumerable: true,
            configurable: true,
            writable: true,
          });

          return copy;
        };

        // BOTH channels, because that is what the door's docblock claims.
        return {
          ...forwarded,
          params: poison(forwarded.params) as Params,
          search: poison(forwarded.search) as SearchParams,
        };
      },
    );

    const href = router.buildPath("list", {}, { q: "x" });

    expect(href).not.toContain("__proto__");
    expect(href).toBe("/list?page=1&q=x");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
