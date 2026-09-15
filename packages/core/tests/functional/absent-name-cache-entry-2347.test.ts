import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Route, Router, State } from "@real-router/core";

/**
 * A name NO route carries must leave no record behind (#2347).
 *
 * The query registry caches per route name, and the cache is freed only by a
 * tree REBUILD (`add` / `remove` / `clear` / `replace` / `setRootPath` — never
 * `update`). So an entry written for a name that names nothing is held for the
 * life of the tree, and the key set is whatever the caller passed.
 *
 * ⚑ **The reachability is the point, and it is not the internals door.** The
 * throwing channel guard runs at the TOP of `navigate`, `makeState` and
 * `buildNavigationState` — all three through `throwOnMisChanneledKey`, which
 * asks the registry before anything has asked whether the route exists. Plain
 * `@real-router/core`, plain public API, no `/validation` import needed to
 * reach it. `navigateToState` is the one channel-guard position that checks
 * existence FIRST, which is why it is absent from the table below.
 *
 * ⚠ **Every row is measured through BOTH a real and an absent name.** A row
 * that only asserted "the absent name adds nothing" would stay green if the
 * registry stopped caching altogether — the real-name half is what says the
 * cache is still a cache.
 *
 * ⚑ **Its TWIN registry had the same defect through a different door.** The
 * store keeps two caches with one lifecycle, and `urlParamsCache` recorded an
 * absent name too — reached not by a channel guard but by `areStatesEqual`,
 * which reads the path-slot names of whatever route BOTH operands claim to be,
 * on its DEFAULT options. Fixed in the same pass, and pinned below: a sweep
 * that stopped at the door the report named would have left it.
 */

const ROUTES: readonly Route[] = [
  { name: "home", path: "/" },
  { name: "u", path: "/u/:id?tab" },
];

const ABSENT = "ghost";

interface Door {
  readonly label: string;
  /** Asks the query registry for `name`, swallowing however it refuses. */
  readonly ask: (router: Router, name: string) => Promise<void>;
}

/**
 * The doors that hand a CALLER-CONTROLLED name to the query registry before
 * anything has checked that a route carries it.
 */
const DOORS: readonly Door[] = [
  {
    label: "router.navigate",
    ask: async (router, name) => {
      await router.navigate(name, { id: "1" }).catch(() => undefined);
    },
  },
  {
    label: "getPluginApi().makeState",
    ask: (router, name) => {
      try {
        getPluginApi(router).makeState(name, { id: "1" }, {}, `/${name}`);
      } catch {
        /* the registry was already asked */
      }

      return Promise.resolve();
    },
  },
  {
    label: "getPluginApi().buildNavigationState",
    ask: (router, name) => {
      try {
        getPluginApi(router).buildNavigationState(name, { id: "1" });
      } catch {
        /* the registry was already asked */
      }

      return Promise.resolve();
    },
  },
  {
    label: "getInternals().getQueryParams",
    ask: (router, name) => {
      getInternals(router).getQueryParams(name);

      return Promise.resolve();
    },
  },
];

const cacheOf = (router: Router): Map<string, readonly string[]> =>
  getInternals(router).routeGetStore().queryParamsCache;

const fresh = async (): Promise<Router> => {
  const router = createRouter([...ROUTES]);

  await router.start("/");
  cacheOf(router).clear();

  return router;
};

describe("a name no route carries leaves no cache entry (#2347)", () => {
  it.each(DOORS.map((door) => [door.label, door] as const))(
    "%s — an ABSENT name is not recorded",
    async (_label, door) => {
      const router = await fresh();

      await door.ask(router, ABSENT);

      expect([...cacheOf(router).keys()]).toStrictEqual([]);

      router.stop();
    },
  );

  it.each(DOORS.map((door) => [door.label, door] as const))(
    "%s — CONTROL: a REAL name still is",
    async (_label, door) => {
      const router = await fresh();

      await door.ask(router, "u");

      expect([...cacheOf(router).keys()]).toStrictEqual(["u"]);

      router.stop();
    },
  );

  it("CONTROL — the table is not empty, so neither `each` above is vacuous", () => {
    expect(DOORS).toHaveLength(4);
    expect(new Set(DOORS.map((door) => door.label)).size).toBe(DOORS.length);
  });

  it("the PUBLIC door: fifty-one unknown names hold nothing", async () => {
    const router = await fresh();

    await router.navigate("u", { id: "1" }).catch(() => undefined);

    const held = cacheOf(router).size;

    for (let index = 0; index < 51; index += 1) {
      await router.navigate(`${ABSENT}-${index}`).catch(() => undefined);
    }

    expect(cacheOf(router).size).toBe(held);

    router.stop();
  });

  it("the TWIN registry: areStatesEqual records no absent name either", async () => {
    const router = await fresh();
    const urlCache = getInternals(router).routeGetStore().urlParamsCache;

    const absent = (name: string): State =>
      ({
        name,
        params: {},
        search: {},
        path: `/${name}`,
        meta: undefined,
      }) as unknown as State;

    urlCache.clear();

    for (let index = 0; index < 51; index += 1) {
      // Default options — `ignoreQueryParams` defaults to `true`, which is the
      // arm that consults the path-slot registry.
      expect(
        router.areStatesEqual(
          absent(`${ABSENT}-${index}`),
          absent(`${ABSENT}-${index}`),
        ),
      ).toBe(true);
    }

    expect([...urlCache.keys()]).toStrictEqual([]);

    // CONTROL — a REAL name still is recorded, so the assertion above is not
    // "the twin stopped caching".
    expect(router.areStatesEqual(absent("u"), absent("u"))).toBe(true);
    expect([...urlCache.keys()]).toStrictEqual(["u"]);

    router.stop();
  });

  it("two DIFFERENT absent names answer with the SAME array", async () => {
    const router = await fresh();
    const internals = getInternals(router);

    const first = internals.getQueryParams("absent-a");
    const second = internals.getQueryParams("absent-b");

    // Identity, not equality: this is what ties the subtracted registry to its
    // twin `getPrintedQueryParams`, which has always shared one frozen empty.
    expect(first).toBe(second);
    expect(first).toStrictEqual([]);

    router.stop();
  });
});
