import { beforeEach, describe, expect, it } from "vitest";

import { constants, createRouter } from "@real-router/core";
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

  it("what the door hands the chain is SANITISED, on the channel it does not normalise", () => {
    // ⚑ The door normalises `params` before the seam, so the unsafe key is gone
    // from that channel by then — `search` is handed on raw, and the seam's
    // `sanitiseNext` is the only thing between a caller's poisoned query bag and
    // a plugin author following the documented extension point. Removing it
    // reds nothing else in the suite; this is the cell that notices.
    router = createRouter(withDefault);

    let seenOwnUnsafeKey: boolean | undefined;

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        const forwarded = next(name, params, search);

        seenOwnUnsafeKey = Object.hasOwn(forwarded.search, "__proto__");

        return forwarded;
      },
    );

    const poisoned: Record<string, unknown> = { q: "x" };

    Object.defineProperty(poisoned, "__proto__", {
      value: "polluted",
      enumerable: true,
      configurable: true,
      writable: true,
    });

    router.buildPath("list", {}, poisoned as SearchParams);

    expect(seenOwnUnsafeKey).toBe(false);
  });

  it("the chain is handed a params BAG when the caller omits one", () => {
    // The door's own `?? EMPTY_PARAMS`, and it is not the net one layer down:
    // that one catches an interceptor's partial RESULT, this one decides what
    // the FIRST interceptor is handed. Without it the chain sees `undefined`
    // where the declared type promises `Params` — a divergence from the
    // navigate door, which always hands a bag.
    router = createRouter(withDefault);

    let seenType: string | undefined;

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        seenType = params === undefined ? "undefined" : typeof params;

        return next(name, params, search);
      },
    );

    router.buildPath("list");

    expect(seenType).toBe("object");
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

  it("both doors hand the chain the CALLER's own bag, not a normalised copy", async () => {
    // ⚑ #2087 is one chain reached by two doors, so what the two doors PUT INTO
    // it has to agree as well. A `normalizeChannel` at either door would strip
    // `undefined`-valued keys and the unsafe one before any interceptor ran,
    // while the other door handed the same chain the caller's object — the same
    // two-doors-one-chain divergence this file exists to close, one layer up.
    //
    // ⚠ Identity is the discriminator, not the key set: a copy that happens to
    // carry the same keys still breaks an interceptor that writes through to the
    // caller's bag, and only `===` notices.
    router = createRouter(withoutDefault);

    const seen: { door: string; own: boolean; keys: string[] }[] = [];
    let mine: Params | undefined;
    // The door under test, set before each call — `start()` runs this chain too,
    // and ordering is not a label.
    let door = "";

    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        if (door !== "") {
          seen.push({ door, own: params === mine, keys: Object.keys(params) });
        }

        return next(name, params, search);
      },
    );
    await router.start("/");

    const bag = (): Params =>
      Object.defineProperty({ extra: "2", absent: undefined }, "__proto__", {
        value: "x",
        enumerable: true,
        configurable: true,
        writable: true,
      });

    mine = bag();
    door = "buildPath";
    router.buildPath("list", mine);

    mine = bag();
    door = "navigate";
    await router.navigate("list", mine);

    expect(seen).toStrictEqual([
      { door: "buildPath", own: true, keys: ["extra", "absent", "__proto__"] },
      { door: "navigate", own: true, keys: ["extra", "absent", "__proto__"] },
    ]);
  });

  it("the ⑤a executor sees ONE params shape, `UNKNOWN_ROUTE` included", () => {
    // ⚠ That arc is the one that skips `canonicalize` — there the URL is the
    // payload, not an intent — so the strip every other route gets from the
    // pipeline is spelled at the branch instead. The door above hands the seam
    // the caller's own bag deliberately — "both doors hand the chain the
    // CALLER's own bag" — and that decision stops at the seam rather than
    // reaching the executor.
    router = createRouter(withoutDefault);

    // ⚠ The seam types `params` optional, so presence is pinned too rather than
    // assumed away by a `?? {}` that would read as "no keys".
    const seen: { present: boolean; keys: string[]; ownProto: boolean }[] = [];

    getPluginApi(router).addInterceptor(
      "buildPath",
      (next, route, params, search) => {
        seen.push({
          present: params !== undefined,
          keys: Object.keys(params ?? {}),
          ownProto: params !== undefined && Object.hasOwn(params, "__proto__"),
        });

        return next(route, params, search);
      },
    );

    const bag = Object.defineProperty(
      { path: "/raw?x=1", absent: undefined },
      "__proto__",
      { value: "x", enumerable: true, configurable: true, writable: true },
    ) as Params;

    const href = router.buildPath(constants.UNKNOWN_ROUTE, bag);

    expect(href).toBe("/raw?x=1");
    expect(seen).toStrictEqual([
      { present: true, keys: ["path"], ownProto: false },
    ]);
  });
});
