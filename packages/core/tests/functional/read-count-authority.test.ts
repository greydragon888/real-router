import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRouter, resolveForwardChain } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import {
  countingBag,
  countingProxy,
  driftingBag,
} from "../helpers/hostileBags";

import type { State } from "@real-router/core/types";

/**
 * How many times does core read a key of an object the CALLER owns?
 *
 * ⚑ **This is the only instrument that discriminates.** An object the caller
 * owns is application code — `packages/core/CLAUDE.md` says so for `opts`
 * (*"accessor- or Proxy-backed by contract, so every read is a call into
 * application code, and a second read may answer differently"*) and the same
 * holds for `params`, `search`, route configs, options and dependencies. A door
 * that reads a key twice can ADMIT it on one value and USE another.
 *
 * Nothing else in the suite can see that. A getter answering consistently
 * produces the same router however many times it is read, so 4400 tests, a
 * 100 % coverage gate and a documented invariant all agreed the count was 1
 * where it is 2. The claim survived because nobody counted.
 *
 * ⚠ **A count above 1 is not automatically a bug**, and this table does not
 * pretend otherwise. It is a fact, kept where a change to it is visible. Each
 * row above 1 carries the reason it is there and the issue that owns it.
 *
 * ⚠ **A count of 0 is a broken PROBE, not a clean door.** `isActiveRoute` reads
 * nothing when the router is not on the route — it early-outs first. Every cell
 * below is written so the probe reaches the read; if you add a door, prove the
 * read happens before you trust the number.
 *
 * ⚠ **The door set is listed, and it cannot be DERIVED the way the write axis
 * is.** `computed-key-write-authority-1852` walks `src` and finds every write
 * because a write is one expression — `x[k] = v` is visible in the AST whole. A
 * second read is a property of the data FLOW, and the flow crosses modules:
 * #1911's five reads live in `validation-plugin`'s two validators and core's
 * `route-batch.ts`, with the snapshot four files away in `routesStore.ts`.
 *
 * Three derivations were built and measured over `packages/*` + `shared`
 * (437 files), against the four sites #1911 / #1930 / #2008 name:
 *
 *     same `param.prop` read twice in one function    142 ms  218 hits  1 of 4
 *     param read, then forwarded by identity          142 ms  214 hits  1 of 4
 *     type-directed: read + forward to a reading callee  1120 ms  141 hits  0 of 4
 *
 * The type-directed one is affordable — 1.1 s against a ~23 s suite — and it
 * catches FEWER than the free syntactic ones. Cost was not the obstacle.
 *
 * The four sites share a concept and not a shape: two are an intra-function
 * double read (`cloneRouter`, `systemCommit`), one reads and returns the
 * caller's own object for a downstream walk (`withholdFilledSlots`), and #1911
 * reads in two `validation-plugin` validators and snapshots four files away. A
 * scan catches at most one family, and each of the three caught a different one.
 *
 * None is in the tree. The numbers are here so the next attempt starts from the
 * falsification instead of repeating it.
 *
 * Companion: `helpers/hostileBags` (the shapes), `/bugfix` Phase 4.5 vector 0.
 */
describe("how many times core reads a caller-owned key", () => {
  const ROUTES = [
    { name: "u", path: "/u/:id?tab" },
    { name: "home", path: "/home" },
  ];

  const mk = (options: object = {}): ReturnType<typeof createRouter> =>
    createRouter(ROUTES as never, options as never);

  /**
   * A params bag whose declared query key `tab` answers `undefined` until the
   * `nth` read, then `"SHIPPED"` — so every guard that reads it earlier sees an
   * absent key and passes it on.
   */
  const answeringOnRead = (
    nth: number,
  ): { bag: object; reads: Record<string, number> } => {
    const reads: Record<string, number> = {};
    const bag = {};

    Object.defineProperty(bag, "id", { enumerable: true, get: () => "7" });
    Object.defineProperty(bag, "tab", {
      enumerable: true,
      get(): unknown {
        reads.tab = (reads.tab ?? 0) + 1;

        return reads.tab >= nth ? "SHIPPED" : undefined;
      },
    });

    return { bag, reads };
  };

  /** Did the door refuse? At equal counts that is the discriminating half. */
  const refused = async (run: () => Promise<unknown>): Promise<boolean> => {
    try {
      await run();

      return false;
    } catch {
      return true;
    }
  };

  /** The highest per-key count, which is what a TOCTOU needs. */
  const peak = (reads: Readonly<Record<string, number>>): number =>
    Math.max(0, ...Object.values(reads));

  /**
   * One legal value per member of `STANDARD_ROUTE_KEYS`. The control at the
   * bottom of this file asserts the set below IS that set, so a field added to
   * the type without a value here fails rather than going unmeasured.
   */
  const FIELD_VALUE: Readonly<Record<string, unknown>> = {
    name: "z",
    path: "/z?tab",
    children: [{ name: "kid", path: "/kid" }],
    canActivate: () => () => true,
    canDeactivate: () => () => true,
    forwardTo: "z.kid",
    encodeParams: (channels: unknown) => channels,
    decodeParams: (channels: unknown) => channels,
    defaultParams: {},
    defaultSearch: { tab: "d" },
  };
  const MEASURED_FIELDS = Object.keys(FIELD_VALUE);

  /**
   * A route carrying ONE measured field, not one carrying all ten.
   *
   * ⚠ Measured, and NOT because a shared fixture hides reads today — it does
   * not: all ten counts come out identical either way. It is that each row is
   * then independent of which OTHER fields happen to be present, and a route
   * carrying all ten is not a neutral fixture — `forwardTo` beside a guard
   * makes core warn twice and take the redirect branch instead of the guard
   * one, so the mix a shared fixture forces is one no caller writes.
   */
  const routeFor = (field: string): ReturnType<typeof countingProxy> => {
    const source: Record<string, unknown> = {
      name: "z",
      path: "/z?tab",
      [field]: FIELD_VALUE[field],
    };

    if (field === "forwardTo") {
      source.children = FIELD_VALUE.children;
    }

    // A Proxy, not accessors: a route definition carrying getters is refused
    // on the caller's own value now (#1911), above the snapshot.
    return countingProxy(source);
  };

  // ⚑ A `subscribeChanges` listener is part of the measurement, not a detail
  // (#1931). `add` builds its `TREE_CHANGED` payload only when someone is
  // listening, and that build used to walk the CALLER's array a second time —
  // so every count below read 1 without a listener and 2 with one, and this
  // table pinned the 1. The listener is attached for every door: `replace` and
  // `createRouter` derive their payloads from the store, so it costs them
  // nothing, and asking all three the same question is what makes the
  // `doorsAgree` row below mean anything.
  const readsThroughDoor = (
    field: string,
    door: "createRouter" | "add" | "replace",
  ): number => {
    const route = routeFor(field);
    const router =
      door === "createRouter"
        ? createRouter([route.bag] as never)
        : createRouter([] as never);

    getRoutesApi(router).subscribeChanges(() => {});

    if (door === "add") {
      getRoutesApi(router).add([route.bag] as never);
    } else if (door === "replace") {
      getRoutesApi(router).replace([route.bag] as never);
    }

    router.dispose();

    return route.reads[field] ?? 0;
  };

  // How many listeners a router admits before its cap bites — the witness that a
  // clone really inherited a cap rather than silently getting none.
  const subscribeUntilThrow = (
    router: ReturnType<typeof createRouter>,
  ): number => {
    let n = 0;

    try {
      for (let i = 0; i < 200; i += 1) {
        router.subscribe(() => {});
        n += 1;
      }
    } catch {
      /* capped */
    }

    return n;
  };

  it("the whole table, in one assertion", async () => {
    const table: Record<string, number | string> = {};

    // ── params / search, across every producer and predicate ──────────────
    {
      const router = mk();

      await router.start("/home");

      const params = countingBag({ id: "7" });
      const search = countingBag({ tab: "x" });

      await router
        .navigate("u", params.bag as never, search.bag as never)
        .catch(() => undefined);

      table["navigate · params"] = peak(params.reads);
      table["navigate · search"] = peak(search.reads);
      router.dispose();
    }
    {
      // ⚑ A FORWARDING route, and the hop carries NO defaults — the shape the
      // table never had (#1848). Both matter:
      //
      //   • forwarding, because the seam (`#layerChainDefaults`) is what hands
      //     the bag onward, and a direct navigation never reaches it;
      //   • no defaults, because `mergeDefined(undefined, bag)` returns its
      //     INPUT BY REFERENCE. A hop that DOES carry defaults allocates a
      //     merged object instead, so the caller's bag stops flowing and a cell
      //     built on one would pin nothing.
      //
      // Measured before the fix: params 2, search 2 at all four doors of the
      // resolving form, where a direct navigation reads 1.
      const fwdRoutes = [
        { name: "u", path: "/u/:id?tab" },
        { name: "src", path: "/src/:id?tab", forwardTo: "u" },
        { name: "elsewhere", path: "/elsewhere" },
      ];
      const fwdRouter = (): ReturnType<typeof createRouter> =>
        createRouter(fwdRoutes as never);

      {
        const router = fwdRouter();

        await router.start("/elsewhere");

        const params = countingBag({ id: "7" });
        const search = countingBag({ tab: "x" });

        await router
          .navigate("src", params.bag as never, search.bag as never)
          .catch(() => undefined);

        table["navigate · params (forwarding hop)"] = peak(params.reads);
        table["navigate · search (forwarding hop)"] = peak(search.reads);
        router.dispose();
      }

      {
        const router = fwdRouter();

        await router.start("/elsewhere");

        const params = countingBag({ id: "7" });
        const search = countingBag({ tab: "x" });

        router.canNavigateTo("src", params.bag, search.bag);
        table["canNavigateTo · params (forwarding hop)"] = peak(params.reads);
        table["canNavigateTo · search (forwarding hop)"] = peak(search.reads);
        router.dispose();
      }

      {
        // ⚠ Started ON the forward TARGET. With the router anywhere else this
        // door early-outs before the seam and reads once — a fixture that looks
        // like a cell and measures nothing. Cost me a wrong first reading.
        const router = fwdRouter();

        await router.start("/u/7");

        const params = countingBag({ id: "7" });
        const search = countingBag({ tab: "x" });

        router.isActiveRoute("src", params.bag, search.bag);
        table["isActiveRoute · params (forwarding hop)"] = peak(params.reads);
        table["isActiveRoute · search (forwarding hop)"] = peak(search.reads);
        router.dispose();
      }

      {
        const router = fwdRouter();
        const params = countingBag({ id: "7" });
        const search = countingBag({ tab: "x" });

        getPluginApi(router).buildNavigationState(
          "src",
          params.bag,
          search.bag,
        );
        table["buildNavigationState · params (forwarding hop)"] = peak(
          params.reads,
        );
        table["buildNavigationState · search (forwarding hop)"] = peak(
          search.reads,
        );
        router.dispose();
      }

      {
        // CONTROL — the SAME doors on a hop that DOES carry defaults. It reads
        // once today and must keep reading once, which is what makes the rows
        // above a measurement of the leak rather than of forwarding itself.
        const router = createRouter([
          { name: "u", path: "/u/:id?tab" },
          {
            name: "src",
            path: "/src/:id?tab",
            forwardTo: "u",
            defaultParams: { z: "1" },
            defaultSearch: { w: "1" },
          },
          { name: "elsewhere", path: "/elsewhere" },
        ] as never);

        await router.start("/elsewhere");

        const params = countingBag({ id: "7" });
        const search = countingBag({ tab: "x" });

        await router
          .navigate("src", params.bag as never, search.bag as never)
          .catch(() => undefined);

        table["CONTROL navigate · params (hop WITH defaults)"] = peak(
          params.reads,
        );
        table["CONTROL navigate · search (hop WITH defaults)"] = peak(
          search.reads,
        );
        router.dispose();
      }
    }
    {
      // The commit doors have no row until now, and their bags ARE caller-owned:
      // `navigateToState` takes a State a plugin built (#1792).
      const router = mk();

      await router.start("/home");

      const params = countingBag({ id: "7" });
      const search = countingBag({ tab: "x" });

      await getPluginApi(router)
        .navigateToState({
          name: "u",
          params: params.bag,
          search: search.bag,
          path: "/u/7?tab=x",
        } as never)
        .catch(() => undefined);

      table["navigateToState · params"] = peak(params.reads);
      table["navigateToState · search"] = peak(search.reads);
      router.dispose();
    }
    {
      // The same door, armed. A CONSTANT bag carrying a declared query key
      // never gets this far — the guard finds a defined value and refuses, so
      // the copy never runs and the count is 1. Drifting past the guard is what
      // exposes the door's real read count, and the same drift is what makes
      // the TOCTOU observable.
      const router = mk();

      await router.start("/home");

      const params = driftingBag<{ id: string; tab: string | undefined }>(
        { id: "7", tab: undefined },
        { tab: "SHIPPED" },
      );

      await getPluginApi(router)
        .navigateToState({
          name: "u",
          params: params.bag,
          search: {},
          path: "/u/7",
        } as never)
        .catch(() => undefined);

      table["navigateToState · params, declared key answering undefined"] =
        peak(params.reads);

      expect(
        router.getState()?.params,
        "the count is not academic: the value the guard never saw is committed, in the channel it guards",
      ).toStrictEqual({ id: "7", tab: "SHIPPED" });

      router.dispose();
    }
    {
      // ⚑ #1850's own fixture at the two doors it names: a DECLARED query key
      // riding in the `params` bag, answering `undefined` until the third read.
      // Each guard that reads it therefore sees an absent key and passes it on,
      // which is what makes the last read the interesting one.
      const router = mk();

      await router.start("/home");

      const navBag = answeringOnRead(3);
      const navRefused = await refused(() =>
        router.navigate("u", navBag.bag as never),
      );

      table["navigate · params, declared key answering undefined"] = peak(
        navBag.reads,
      );

      expect(
        navRefused,
        "the THIRD read is a guard's as well, so the door refuses",
      ).toBe(true);

      const makeBag = answeringOnRead(3);
      const made = getPluginApi(router).makeState(
        "u",
        makeBag.bag as never,
        {} as never,
      );

      table["makeState · params, declared key answering undefined"] = peak(
        makeBag.reads,
      );

      expect(
        made?.params,
        "one guard fewer, so the third read never happens, `tab` stays absent, and the state agrees with its own path",
      ).toStrictEqual({ id: "7" });

      expect(made?.path, "and the path shows the same").toBe("/u/7");

      router.dispose();
    }
    {
      // ⚑ The control for the block above: the same key, in the channel the
      // route declares it in, so no channel guard reads it.
      const router = mk();

      await router.start("/home");

      const navSearch = driftingBag<{ tab: string | undefined }>(
        { tab: undefined },
        { tab: "SHIPPED" },
      );

      await router.navigate("u", { id: "7" } as never, navSearch.bag as never);

      table["navigate · search, declared key answering undefined"] = peak(
        navSearch.reads,
      );

      const makeSearch = driftingBag<{ tab: string | undefined }>(
        { tab: undefined },
        { tab: "SHIPPED" },
      );

      getPluginApi(router).makeState(
        "u",
        { id: "7" } as never,
        makeSearch.bag as never,
      );

      table["makeState · search, declared key answering undefined"] = peak(
        makeSearch.reads,
      );

      router.dispose();
    }
    {
      // The FOURTH door. It had no row while its sibling had two, and the commit
      // that added those rows says "the commit doors have no row until now" in
      // the plural — so the omission read as coverage.
      const router = mk();

      await router.start("/home");

      const base = getPluginApi(router).makeState(
        "u",
        { id: "7" },
        { tab: "x" },
      ) as unknown as State;
      const params = countingBag({ id: "7" });
      const search = countingBag({ tab: "x" });

      getInternals(router).systemCommit(
        { ...base, params: params.bag, search: search.bag },
        router.getState(),
        {},
      );

      table["systemCommit · params"] = peak(params.reads);
      table["systemCommit · search"] = peak(search.reads);
      router.dispose();
    }
    {
      const router = mk();
      const params = countingBag({ id: "7" });
      const search = countingBag({ tab: "x" });

      router.buildPath("u", params.bag, search.bag);
      table["buildPath · params"] = peak(params.reads);
      table["buildPath · search"] = peak(search.reads);
      router.dispose();
    }
    {
      // ⚑ The same doors WITH a plugin on the seam (#1849). The bare rows above
      // cannot see this: with no interceptor registered the wrapper takes its
      // fast path, the caller's bag reaches `canonicalize` untouched and is read
      // once. Install a pass-through that READS and forwards, and without the
      // seam's snapshot the caller's accessor answers TWICE — once to the
      // plugin, once to the pipeline — and the URL is built from the read the
      // plugin never saw.
      const router = mk();
      const params = countingBag({ id: "7" });
      const search = countingBag({ tab: "x" });
      const navParams = countingBag({ id: "7" });
      const navSearch = countingBag({ tab: "x" });

      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, name, p, s) => {
          // The shape the issue names: read both channels, forward them unchanged.
          void (p as Record<string, unknown>).id;
          void (s as Record<string, unknown> | undefined)?.tab;

          return next(name, p, s);
        },
      );

      router.buildPath("u", params.bag, search.bag);
      table["buildPath · params (interceptor on the seam)"] = peak(
        params.reads,
      );
      table["buildPath · search (interceptor on the seam)"] = peak(
        search.reads,
      );

      await router.start("/home");
      await router.navigate(
        "u",
        navParams.bag as never,
        navSearch.bag as never,
      );
      table["navigate · params (interceptor on the seam)"] = peak(
        navParams.reads,
      );
      table["navigate · search (interceptor on the seam)"] = peak(
        navSearch.reads,
      );
      router.dispose();
    }
    {
      const router = mk();

      // ⚠ ON the route, or the predicate early-outs and reads nothing.
      await router.start("/u/7?tab=x");

      const params = countingBag({ id: "7" });
      const search = countingBag({ tab: "x" });

      router.isActiveRoute("u", params.bag, search.bag);
      table["isActiveRoute · params"] = peak(params.reads);
      table["isActiveRoute · search"] = peak(search.reads);
      router.dispose();
    }
    {
      const router = mk();

      await router.start("/home");

      const params = countingBag({ id: "7" });
      const search = countingBag({ tab: "x" });

      router.canNavigateTo("u", params.bag, search.bag);
      table["canNavigateTo · params"] = peak(params.reads);
      // ⚑ The `search` half had no row while the `params` half did, and the two
      // are one call. #1812 moved this door from 2 to 1 and nothing recorded it —
      // an asymmetry INSIDE the table reads as coverage exactly the way a missing
      // door does.
      table["canNavigateTo · search"] = peak(search.reads);
      router.dispose();
    }
    {
      // `buildNavigationState` had no row at all, on either channel. It takes a
      // caller-owned query bag into the same merge as its five siblings
      // (INVARIANTS 2a enumerates SIX doors that accept a query channel, not the
      // four the #1812 changeset names), and #1812 moved it from 2 to 1 too.
      const router = mk();
      const params = countingBag({ id: "7" });
      const search = countingBag({ tab: "x" });

      getPluginApi(router).buildNavigationState("u", params.bag, search.bag);
      table["buildNavigationState · params"] = peak(params.reads);
      table["buildNavigationState · search"] = peak(search.reads);
      router.dispose();
    }
    {
      const router = mk();
      const params = countingBag({ id: "7" });
      const search = countingBag({ tab: "x" });

      getPluginApi(router).makeState(
        "u",
        params.bag as never,
        search.bag as never,
      );
      table["makeState · params"] = peak(params.reads);
      table["makeState · search"] = peak(search.reads);
      router.dispose();
    }

    // ── the navigation options bag ─────────────────────────────────────────
    {
      const router = mk();

      await router.start("/home");

      const opts = countingBag({
        reload: false,
        replace: false,
        redirected: false,
        force: false,
      });

      await router
        .navigate("u", { id: "7" }, {}, opts.bag as never)
        .catch(() => undefined);

      for (const [key, count] of Object.entries(opts.reads)) {
        table[`navigate · opts.${key}`] = count;
      }

      router.dispose();
    }

    // ── construction and registration bags ────────────────────────────────
    {
      const queryParams = countingBag({ arrayFormat: "brackets" });
      const router = mk({ queryParams: queryParams.bag });

      table["createRouter · options.queryParams"] = peak(queryParams.reads);

      // The row that carries the trade: a matcher REBUILD must read nothing.
      const atConstruction = peak(queryParams.reads);
      const matcherBefore = getInternals(router).routeGetStore().matcher;

      getRoutesApi(router).add({ name: "z", path: "/z" });
      table["…and on a later matcher rebuild"] =
        peak(queryParams.reads) - atConstruction;
      // Witness, for the same reason as the `urlParamsEncoding` one below: a
      // zero only means something if the door fired. Deleting the `add` above
      // left this file green until this row existed.
      table["…and that rebuild really happened (queryParams probe control)"] =
        matcherBefore === getInternals(router).routeGetStore().matcher ? 0 : 1;

      // ⚑ And the two HOT doors, which are what the hoist was FOR and what its
      // −10 % is made of. The rebuild row above cannot stand in for this one:
      // before the hoist the strategies were resolved per CALL, so every
      // query-carrying `matchPath` and `buildPath` re-read the caller's bag
      // while a rebuild-only probe still printed 0. Measured — both are 0 now,
      // and a per-call resolution puts them at 1 each.
      const beforeHotPath = peak(queryParams.reads);

      getPluginApi(router).matchPath("/u/1?tab[]=a&tab[]=b");
      router.buildPath("u", { id: "1" }, { tab: ["a", "b"] });

      table["…and on a query-carrying matchPath + buildPath"] =
        peak(queryParams.reads) - beforeHotPath;
      router.dispose();
    }
    {
      // ⚑ The sibling that did NOT get the snapshot until #1839. It is a scalar,
      // not a bag, so `countingBag` does not fit — the caller's code hangs off
      // `toString`, and the matcher's constructor coerces it. Same trade as the
      // rows above: construction is where application code is expected, a
      // matcher rebuild is not, and `dispose()` goes through one.
      let reads = 0;
      const urlParamsEncoding = {
        toString: () => {
          reads += 1;

          return "uri";
        },
      };
      const router = mk({ urlParamsEncoding });

      table["createRouter · options.urlParamsEncoding"] = reads;

      const atConstruction = reads;
      const matcherBefore = getInternals(router).routeGetStore().matcher;

      getRoutesApi(router).add({ name: "z2", path: "/z2" });
      table["…and on a later matcher rebuild (urlParamsEncoding)"] =
        reads - atConstruction;

      // ⚑ POSITIVE CONTROL for the zero-row above. A count of ZERO only means
      // something if the door actually fired: delete the `add` and that row
      // stays green while measuring nothing, which is the probe-rot this file's
      // own header warns about. Matcher IDENTITY is the witness, since every
      // rebuild door replaces `store.matcher` rather than mutating it. The
      // `queryParams` block above carries its own; EVERY zero-row needs one,
      // including the teardown row below.
      table["…and that rebuild really happened (probe control)"] =
        matcherBefore === getInternals(router).routeGetStore().matcher ? 0 : 1;

      const beforeTeardown = reads;
      const matcherBeforeTeardown =
        getInternals(router).routeGetStore().matcher;

      router.dispose();
      table["…and through dispose() (urlParamsEncoding)"] =
        reads - beforeTeardown;
      // The teardown door's own witness. Without it, deleting the `dispose()`
      // above leaves the row reporting 0 for a door that never fired — measured,
      // the whole package stayed green. `dispose()` goes through `resetStore`,
      // which rebuilds the tree, so the matcher is replaced here too.
      table["…and that dispose really happened (probe control)"] =
        matcherBeforeTeardown === getInternals(router).routeGetStore().matcher
          ? 0
          : 1;
    }
    {
      // ⚑ The third construction-time scalar, and the one #1875 asked to be
      // recorded HERE, beside `queryParams` and `urlParamsEncoding` — a table
      // that omits the count it just fixed is not an authority. Same shape as
      // the encoding row: the caller's code hangs off `valueOf`, because
      // `LimitsConfig` declares the field `number`.
      let reads = 0;
      const maxListeners = {
        valueOf: () => {
          reads += 1;

          return 25;
        },
      };
      const router = mk({
        limits: { maxListeners },
      });

      table["createRouter · options.limits.maxListeners"] = reads;

      // The row that carries the trade. Registration is the door that used to
      // re-read: the cap is consulted on every `subscribe()`, so before #1875 a
      // long-lived router called into application code once per listener, and a
      // value that drifted capped two subscribers differently.
      const atConstruction = reads;

      for (let i = 0; i < 20; i += 1) {
        router.subscribe(() => {});
      }

      table["…and on 20 later subscribe() calls"] = reads - atConstruction;
      // POSITIVE CONTROL, for the same reason every zero-row here has one: the
      // door only fired if the cap was actually enforced. The 20 above sit under
      // the cap of 25 so they measure reads rather than the throw; these six
      // cross it. A run that swallowed nothing would mean the limit never bound
      // and the zero above measured a door that does not exist.
      let capped = 0;

      try {
        for (let i = 0; i < 6; i += 1) {
          router.subscribe(() => {});
        }
      } catch {
        capped = 1;
      }

      table["…and that the cap really bound (limits probe control)"] = capped;

      router.dispose();
    }
    {
      // ⚑ The clone door (#1880) needs its OWN bag shape, and getting that wrong
      // made this row vacuous once. A `valueOf` on the VALUE cannot see it: the
      // old `createLimits` spread copied that value BY REFERENCE, so the row
      // read 0 on master too and would read 0 with the fix deleted. What #1880
      // fixed is a getter on the BAG — the spread invokes THAT, once per clone,
      // i.e. once per request under `createRequestScope`.
      let bagReads = 0;
      const bag = {
        get maxListeners(): number {
          bagReads += 1;

          return 25;
        },
      };
      const router = mk({ limits: bag });

      table["createRouter · limits BAG getter"] = bagReads;

      const beforeClone = bagReads;
      const clone = cloneRouter(router);

      table["…and through cloneRouter (limits bag)"] = bagReads - beforeClone;
      // POSITIVE CONTROL for that zero. Without it, replacing the substitution
      // with `limits: {}` — a clone that silently drops the caller's limits —
      // leaves this whole file green while the row reports 0 for a door that did
      // nothing. Measured: it did.
      table["…and the clone really inherited the cap"] =
        subscribeUntilThrow(clone) === 25 ? 1 : 0;
      clone.dispose();
      router.dispose();
    }
    {
      const router = mk();
      // The ROUTE OBJECT is the caller's bag. Spreading it into a literal at the
      // call site would read every key once and measure the spread, not the door.
      const route = countingProxy({
        name: "z",
        path: "/z?tab",
        defaultSearch: { tab: "d" },
      });

      getRoutesApi(router).add(route.bag);
      table["add · route.name"] = route.reads.name ?? 0;
      table["add · route.defaultSearch"] = route.reads.defaultSearch ?? 0;
      router.dispose();
    }
    {
      // ⚑ Ten fields × three registration doors — the matrix #1789 asked for.
      // That issue measured THREE reads per structural field and named this
      // table as the guard that would keep the count down; the fix (#1899)
      // shipped without it, so until now TWO of these thirty cells existed and
      // the other twenty-eight were unmeasured.
      //
      // The two rows above stay: they are door-specific where these are the
      // peak across all three, and they carry the history of the only two
      // fields whose count was ever measured wrong.
      let doorsAgree = 1;

      for (const field of MEASURED_FIELDS) {
        const perDoor = [
          readsThroughDoor(field, "createRouter"),
          readsThroughDoor(field, "add"),
          readsThroughDoor(field, "replace"),
        ];

        table[`registration · route.${field}`] = Math.max(...perDoor);

        if (perDoor.some((count) => count !== perDoor[0])) {
          doorsAgree = 0;
        }
      }

      // ⚑ Without this the peak above hides a SILENT door. A door that stopped
      // reading the definition entirely contributes 0, `Math.max` keeps the 1
      // the other two produce, and the row still reads 1 — so the count would
      // stay green for a door that no longer registers anything. Measured: it
      // does hide it, which is why this row exists.
      table["…and all three doors agree, field by field"] = doorsAgree;
    }
    {
      // #1789 named `setRootPath` as a fourth door because it "rebuilds from
      // `store.definitions`". It rebuilds from the SNAPSHOT, so it re-reads
      // nothing — and neither does any later add/remove. Measured, not reasoned.
      const route = countingProxy({
        name: "z",
        path: "/z?tab",
        defaultSearch: { tab: "d" },
      });
      const router = createRouter([route.bag] as never);
      const afterRegistration = route.reads.defaultSearch ?? 0;

      getPluginApi(router).setRootPath("/root");
      getRoutesApi(router).add([{ name: "b", path: "/b" }] as never);
      getRoutesApi(router).remove("b");

      // ⚑ The subtraction below is a DIFFERENCE, and a difference of two zeroes
      // is also zero — a probe that never reached the read reports exactly what
      // "nothing re-read it" reports. Measured: dropping `defaultSearch` from
      // the bag above leaves the whole file green. This row is what makes the
      // next one mean something.
      table["…and the rebuild probe reached the read at all"] =
        afterRegistration;
      table["…and no later rebuild re-reads the definition"] =
        (route.reads.defaultSearch ?? 0) - afterRegistration;
      // Without this the row above reports 0 for rebuilds that never ran.
      table["…and those rebuilds really happened (rootPath control)"] =
        getPluginApi(router).getRootPath() === "/root" ? 1 : 0;
      router.dispose();
    }
    {
      const router = mk();
      const patch = countingBag({ defaultSearch: { tab: "d" } });

      getRoutesApi(router).update("u", patch.bag);
      table["update · patch"] = peak(patch.reads);
      router.dispose();
    }
    {
      // ⚑ ALL THREE dependency doors refuse the shape outright, and that is the
      // parity #1860 restored — `setAll` and `cloneRouter` used to accept an own
      // accessor and RUN it. A door that will not accept an accessor needs no
      // read count, so the cell records the refusal instead of a number, and the
      // three sit together because the table is where they can be compared.
      const doors: [string, (bag: object) => void][] = [
        [
          "createRouter · dependencies",
          (bag) => {
            createRouter(ROUTES as never, {}, bag as never).dispose();
          },
        ],
        [
          "cloneRouter · dependencies",
          (bag) => {
            const base = createRouter(ROUTES as never);

            try {
              cloneRouter(base, bag as never).dispose();
            } finally {
              base.dispose();
            }
          },
        ],
        [
          "setAll · deps",
          (bag) => {
            const router = mk();

            try {
              getDependenciesApi(router).setAll(bag);
            } finally {
              router.dispose();
            }
          },
        ],
      ];

      expect(doors, "the loop below registers one cell per door").toHaveLength(
        3,
      );

      for (const [label, call] of doors) {
        const deps = countingBag({ svc: 1 });

        try {
          call(deps.bag);
          table[label] = peak(deps.reads);
        } catch {
          table[label] = "refused: accessor bag";
        }
      }
    }

    expect(table).toStrictEqual({
      // ── 1 read: the door already snapshots, or reads once by construction ──

      // ⚑ Was `1` here, from #1816, which fixed the loop's double read. #1860
      // moved the cell out of the counting block entirely: the door now refuses
      // an accessor bag before any read, exactly as the constructor always has,
      // so there is no longer a number to report. Its refusal cell lives with the
      // other two below.
      "navigate · params": 1, // normalizeChannel builds from one read per key

      // ⚑ #1848 — a forwarding hop WITHOUT defaults. The seam returned the
      // caller's own bag (`mergeDefined(undefined, bag)` hands back its
      // argument), so `canonicalize` read it a SECOND time. Two shipped claims
      // said otherwise and both were false: #1812's "the PATH channel is immune
      // … (measured: 1 read)" is true only of a direct navigation, and PR
      // #1820's "pinned by the read-count table" had no forwarding row to pin
      // it with — this is that row.
      "navigate · params (forwarding hop)": 1,
      "navigate · search (forwarding hop)": 1,
      "canNavigateTo · params (forwarding hop)": 1,
      "canNavigateTo · search (forwarding hop)": 1,
      "isActiveRoute · params (forwarding hop)": 1,
      "isActiveRoute · search (forwarding hop)": 1,
      "buildNavigationState · params (forwarding hop)": 1,
      "buildNavigationState · search (forwarding hop)": 1,
      "CONTROL navigate · params (hop WITH defaults)": 1,
      "CONTROL navigate · search (hop WITH defaults)": 1,
      // #1812, FIXED: the query bag was read twice — gated on one value and
      // shipped with another. Four doors reached the pair; the path channel
      // never did, because it has always arrived normalised. Both channels now
      // go through `normalizeChannel`.
      "navigate · search": 1,
      "buildPath · search": 1,
      "isActiveRoute · search": 1,
      "makeState · search": 1,
      "buildPath · params": 1,
      // #1849, FIXED: with a plugin ON the seam the caller's bag was read twice
      // — the interceptor's read and the pipeline's. The seam now hands the
      // chain a snapshot, so the caller's accessor answers once whatever is
      // registered. Both doors, both channels.
      "buildPath · params (interceptor on the seam)": 1,
      "buildPath · search (interceptor on the seam)": 1,
      "navigate · params (interceptor on the seam)": 1,
      "navigate · search (interceptor on the seam)": 1,
      "isActiveRoute · params": 1,
      "canNavigateTo · params": 1,
      "canNavigateTo · search": 1,
      "buildNavigationState · params": 1,
      "buildNavigationState · search": 1,
      "makeState · params": 1,
      "navigate · opts.replace": 1, // 2 on the UNKNOWN_ROUTE arc — see below
      "navigate · opts.redirected": 1,
      "navigate · opts.force": 1,
      // ⚑ ONE, and the count is the claim: `deriveMatcherOptions` snapshots the
      // bag a field at a time, and nothing else reads it — the options freeze
      // stops at the level core owns (#1832) and never reaches this bag. A second
      // reader here is not merely wasteful: a getter that re-enters
      // `createRouter` branches once per reader per level, so two of them turn n
      // calls into 2ⁿ.
      //
      // What the snapshot itself buys is the row below: before it, `createMatcher`
      // re-read the caller's object on EVERY matcher rebuild — including
      // `resetStore`, which `dispose()` goes through, so an accessor-backed bag ran
      // application code inside a teardown core documents as running none.
      // Construction is where that code is expected; teardown is not.
      "createRouter · options.queryParams": 1,
      "…and on a later matcher rebuild": 0,
      "…and that rebuild really happened (queryParams probe control)": 1,
      "…and on a query-carrying matchPath + buildPath": 0,

      // #1839 — the sibling snapshotted 58 lines below it in `deriveMatcherOptions`
      // that was handed downstream BY REFERENCE. `SegmentMatcher` coerces it in
      // its constructor, so before the fix this read once per matcher REBUILD:
      // `add` / `remove` / `replace` / `setRootPath`, and `resetStore`, which
      // `dispose()` goes through — where a throwing `toString` tore the teardown
      // after `sendDispose()` and left the router answering `buildPath`.
      "createRouter · options.urlParamsEncoding": 1,
      "…and on a later matcher rebuild (urlParamsEncoding)": 0,
      "…and that rebuild really happened (probe control)": 1,
      "…and through dispose() (urlParamsEncoding)": 0,
      "…and that dispose really happened (probe control)": 1,

      // #1875 / #1880 — the third construction-time scalar. `EventEmitter`
      // consults the cap on EVERY `subscribe()`, so before the coercion moved to
      // construction a long-lived router called into the caller's `valueOf` once
      // per listener, and a value that answered differently capped two
      // subscribers differently. `cloneRouter` re-read it once more, which under
      // `createRequestScope` is once per REQUEST — the clone now inherits the
      // base's resolved numbers instead (#1880).
      "createRouter · options.limits.maxListeners": 1,
      "…and on 20 later subscribe() calls": 0,
      "…and that the cap really bound (limits probe control)": 1,
      "createRouter · limits BAG getter": 1,
      "…and through cloneRouter (limits bag)": 0,
      "…and the clone really inherited the cap": 1,
      "update · patch": 1, // the single destructure, #797 / #952
      "createRouter · dependencies": "refused: accessor bag",
      "cloneRouter · dependencies": "refused: accessor bag",
      "setAll · deps": "refused: accessor bag",

      // #1789 — the matrix that issue asked for: every structural field, every
      // registration door. Nine of the ten are ONE because `snapshotRouteBatch`
      // is the only reader of the caller's definition; the tenth is below.
      "registration · route.name": 1,
      "registration · route.path": 1,
      "registration · route.canActivate": 1,
      "registration · route.canDeactivate": 1,
      "registration · route.forwardTo": 1,
      "registration · route.encodeParams": 1,
      "registration · route.decodeParams": 1,
      "registration · route.defaultParams": 1,
      "registration · route.defaultSearch": 1,

      // #1789 named `setRootPath` as a fourth door that "rebuilds from
      // `store.definitions`" and would therefore re-read. It rebuilds from the
      // SNAPSHOT, so the definition is never read again — by it or by a later
      // add/remove.
      "…and the rebuild probe reached the read at all": 1,
      "…and no later rebuild re-reads the definition": 0,
      "…and those rebuilds really happened (rootPath control)": 1,
      "…and all three doors agree, field by field": 1,

      // ── ABOVE 1: not all defects — each row carries why it is here ────────

      // #1792 — the commit door copies both channels into core's own frozen
      // bags, so it now reads what it used to pass through by reference.
      //
      // ⚠ ONE, like every producer (#1952). The P3 channel guard reads NOTHING
      // for this bag — `findMisChanneledKey` walks the route's declared query
      // names (`tab`) and `Object.hasOwn(params, "tab")` is false — so the count
      // is `adoptForeignBag`'s single walk and nothing else.
      "navigateToState · params": 1,
      "navigateToState · search": 1,

      // ⚠ TWO, and this is the door's real worst case — the row above cannot
      // see it. The guard DOES read, but only a key the route declares with `?`
      // and only until it finds a defined value, so a bag that answers
      // `undefined` on that first read passes the check and is then read once
      // more by the copy. Measured live at this count: the committed
      // `state.params` carries `tab: "SHIPPED"`, a value the guard never saw,
      // in the channel the guard exists to keep it out of — while `state.path`
      // stays `/u/7` and shows nothing. The rows below measure whether the two
      // doors #1850 names share this. It is explicitly OUTSIDE the `__proto__`
      // guarantee (INVARIANTS "Supported input shapes"): recorded rather than
      // closed, because closing it costs the same discipline at every door and
      // buys a shape only the caller can create.
      "navigateToState · params, declared key answering undefined": 2,

      // ⚑ The two rows #1850 asks for, and the counts it measured. Neither
      // door commits what the row above does: `navigate` spends its third read
      // inside a guard and refuses, and `makeState` runs one guard fewer, so
      // the key it would have shipped is never read a third time.
      "navigate · params, declared key answering undefined": 3,
      "makeState · params, declared key answering undefined": 2,

      // ⚑ The control for the pair above: the SAME key, in the channel the
      // route declares it in. One read each — so the extra reads up there are
      // the channel guards', not the producers'.
      "navigate · search, declared key answering undefined": 1,
      "makeState · search, declared key answering undefined": 1,

      // The fourth door runs no channel guard, so neither number carries the
      // extra read its sibling's armed row does. The one read is
      // `adoptForeignBag`'s walk.
      "systemCommit · params": 1,
      "systemCommit · search": 1,

      // §4.1 of the RFC — `executeNavigation` hoists `const reload = opts.reload`
      // (#1719) and then `isSameNavigation` reads `opts.reload` again to decide
      // the SAME_STATES short-circuit. `packages/core/CLAUDE.md` asserts this is
      // 1. It is not, and `state.transition.reload` can record the value that did
      // NOT decide the outcome.
      // ⚑ Was 2, and the table pinned the defect rather than the rule (#1817):
      // the entry hoisted `reload` and `isSameNavigation` read it again, so the
      // flag that DECIDED the SAME_STATES short-circuit and the flag recorded in
      // `state.transition` were two different reads of the caller's object.
      "navigate · opts.reload": 1,

      // #1899 / #1789 — ONE read per own key, since registration snapshots the
      // batch (`snapshotRouteBatch`). These two rows are
      // the reason that fix exists: `name` was SEVEN and `defaultSearch` THREE,
      // so a definition whose `name` was an accessor got VALIDATED under one
      // answer and REGISTERED under another — walking past the reserved-prefix
      // rule (#1047) and the dotted-name rule (#1763), both of which refuse the
      // literal spelling.
      //
      // ⚠ Do not "simplify" these to a shared constant with the other 1s. A
      // regression here is a silent return to reading the caller's object N
      // times, and the two rows carry the only history that says so.
      "add · route.name": 1,
      "add · route.defaultSearch": 1,

      // ⚑ TWO, and NOT a defect — the one row here that no issue owns.
      // `guardRouteStructure` reads `children` to walk into it, and the snapshot
      // reads it again to copy it. The guard cannot be moved behind the
      // snapshot: the snapshot is a spread, and `{...null}`, `{..."ab"}`,
      // `{...42}`, `{...true}` and `{...[…]}` all produce a plain object, so
      // every non-object the guard exists to refuse would pass it. Measured: the
      // divergence window this leaves is not exploitable — five malformed
      // payloads swapped in on read #2 are all still refused, only by a later
      // check and with a different message.
      "registration · route.children": 2,
    });
  });

  it("CONTROL — the registration matrix covers every standard route key", () => {
    // The nine-plus-one rows above are literals, so a field added to `Route`
    // would be registered, unmeasured and unnoticed. `STANDARD_ROUTE_KEYS` is
    // where core decides what is structural, and #1738 already pins that set
    // against the type — this only pins the matrix against the set.
    const source = readFileSync(
      path.resolve(
        __dirname,
        "../../src/namespaces/RoutesNamespace/constants.ts",
      ),
      "utf8",
    );
    const initializer =
      /STANDARD_ROUTE_KEYS[^=]*=\s*new Set\(\[([^\]]*)\]/.exec(source);

    expect(initializer).not.toBeNull();

    const declared = [...initializer![1].matchAll(/"([^"]+)"/g)].map(
      (m) => m[1],
    );

    // ⚑ No length threshold here, and its absence is measured rather than an
    // omission. The first draft carried `toBeGreaterThanOrEqual(10)` on both
    // sides against the vacuum "[] equals []". Both survive removal: an empty
    // MEASURED_FIELDS takes ten rows out of the table above and fails it, and a
    // regex that stops matching fails `not.toBeNull()` one line up — mutated
    // both ways to check. A threshold that cannot change a verdict is an
    // equivalent mutant, so it is gone rather than decorative.

    const alphabetical = (a: string, b: string): number => a.localeCompare(b);

    expect(declared.toSorted(alphabetical)).toStrictEqual(
      MEASURED_FIELDS.toSorted(alphabetical),
    );
  });

  it("CONTROL — the instrument counts, and the table is populated", () => {
    // ⚑ Two independent non-vacuity checks, and NEITHER may depend on a defect.
    // The first draft asserted "some door reads twice", using the `search` pair
    // as its subject — so fixing that pair broke the control. A guard anchored on
    // a bug dies with the bug; this one is anchored on the instrument and on the
    // table's own size.
    const bag = countingBag({ tab: "x" });

    void bag.bag.tab;
    void bag.bag.tab;

    expect(bag.reads).toStrictEqual({ tab: 2 });
  });

  it("CONTROL — every door in the table was actually exercised", () => {
    // A door whose probe never reaches the read reports 0, and 0 would sail
    // through the table above as though the door were clean. Nothing here may be
    // zero: an absent read means the probe is broken, not the door.
    const router = mk();
    const params = countingBag({ id: "7" });

    router.buildPath("u", params.bag);
    router.dispose();

    expect(Object.values(params.reads).every((count) => count > 0)).toBe(true);
  });

  it("the DEFAULTED path is a different pair of reads, and nothing else watches it", async () => {
    // Every producer row above uses a route with no `defaultSearch`, so they all
    // measure `adoptForeignBag`'s copy loop. A route WITH a default takes a
    // different path: `mergeDefined` does its own gate-then-take, and the
    // count is 2 there for entirely different reasons. Because the number
    // matches, the absence of this row was invisible — collapsing that pair to
    // one read (which is what closed the `undefined`-on-a-drifting-bag hole)
    // moved nothing in the table above.
    const router = createRouter([
      { name: "home", path: "/home" },
      { name: "d", path: "/d?keep&other", defaultSearch: { other: "D" } },
    ] as never);

    await router.start("/home");

    const search = countingBag({ keep: "y" });

    await router.navigate("d", {}, search.bag as never).catch(() => undefined);

    expect(
      peak(search.reads),
      "one read per key on the defaulted merge, since the value is taken from the same read that gates it",
    ).toBe(1);

    router.dispose();
  });

  it("an INHERITED accessor is read ZERO times, and the walk still happened", async () => {
    // The one read count that must be zero, and the one this file's own header
    // warns is indistinguishable from a broken probe — so the positive control
    // is inside the cell rather than beside it. `keep` is an own key on the same
    // bag: if it is read, the walk reached the object, and `ghost`'s zero means
    // the walk declined to touch it rather than never arriving.
    //
    // What it pins: the walk that reaches this bag asks `Object.hasOwn` BEFORE
    // reading the value. Drop that half and the inherited getter fires — a call
    // into application code the router has no business making, on a name the
    // caller never put on the bag. Nothing else in the suite sees it: the
    // committed state is identical either way.
    //
    // ⚠ Name the walk this cell actually executes: both channels are routed
    // through `normalizeChannel` before the merge, so the `hasOwn` under test is
    // that function's. A rationale naming a walk the cell does not run survives
    // a refactor while quietly guarding something else.
    const router = mk();

    await router.start("/home");

    let ghostReads = 0;
    let keepReads = 0;

    const proto = {};

    // ⚠ The QUERY channel — kept as the fixture, though the two channels take
    // the same route and `params` discriminates too. Measured both ways before
    // choosing.
    Object.defineProperty(proto, "tab", {
      enumerable: true,
      configurable: true,
      get(): undefined {
        ghostReads += 1;

        return;
      },
    });

    const bag = Object.create(proto) as Record<string, unknown>;

    Object.defineProperty(bag, "keep", {
      enumerable: true,
      configurable: true,
      get(): string {
        keepReads += 1;

        return "yes";
      },
    });

    await router
      .navigate("u", { id: "7" }, bag as never)
      .catch(() => undefined);

    expect(
      keepReads,
      "POSITIVE CONTROL — the walk reached this bag",
    ).toBeGreaterThan(0);
    expect(ghostReads, "and declined to read the inherited name at all").toBe(
      0,
    );

    router.dispose();
  });
});

/**
 * The OTHER operand of the same merge (#1847).
 *
 * Everything above measures the CALLER's bag. A route's own `defaultSearch` /
 * `defaultParams` is a caller-owned object too — `packages/core/CLAUDE.md` says
 * nested config "aliases the live store" and is "read on every navigation", by
 * design — so the same instrument applies to it, and until #1847 the answers
 * were 1 to 4 depending on the door.
 *
 * Two faces followed, and neither lives inside one pass:
 *
 *   - a committed state contradicting its own path — the channel was built from
 *     one read and the URL printed from another;
 *   - `buildPath` disagreeing with `navigate` on one intent — INVARIANTS "href
 *     equals destination" (#1578) — because the two doors shipped different
 *     reads.
 *
 * ⚠ The direction matters and is stated in the issue: a default that turns
 * defined LATE diverges, one that turns undefined late does not. A cell written
 * the other way round passes on the defect.
 */
describe("how many times core reads the ROUTE's own default (#1847)", () => {
  /** A `defaultSearch.tab` that logs every read and can answer differently. */
  const makeRoute = (
    answer: (readNumber: number) => string | undefined,
    log: string[],
  ): { name: string; path: string; defaultSearch: object } => {
    let reads = 0;
    const defaultSearch = {};

    Object.defineProperty(defaultSearch, "tab", {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1;

        const value = answer(reads);

        log.push(String(value));

        return value;
      },
    });

    return { name: "u", path: "/u/:id?tab", defaultSearch };
  };

  const start = async (
    answer: (readNumber: number) => string | undefined,
  ): Promise<{ router: ReturnType<typeof createRouter>; log: string[] }> => {
    const log: string[] = [];
    const router = createRouter([makeRoute(answer, log)] as never);

    await router.start("/u/1");
    log.length = 0;

    return { router, log };
  };

  const STABLE = (): string => "STABLE";

  it("every door reads it exactly once — the whole table", async () => {
    type Door = (
      router: Awaited<ReturnType<typeof start>>["router"],
    ) => unknown;

    const doors: [string, Door][] = [
      ["buildPath", (r) => r.buildPath("u", { id: "7" })],
      ["isActiveRoute", (r) => r.isActiveRoute("u", { id: "7" })],
      ["canNavigateTo", (r) => r.canNavigateTo("u", { id: "7" })],
      ["matchPath", (r) => getPluginApi(r).matchPath("/u/7")],
      ["makeState", (r) => getPluginApi(r).makeState("u", { id: "7" }, {})],
      [
        "buildNavigationState",
        (r) => getPluginApi(r).buildNavigationState("u", { id: "7" }, {}),
      ],
    ];

    const table: Record<string, number> = {};

    for (const [name, call] of doors) {
      const { router, log } = await start(STABLE);

      call(router);
      table[name] = log.length;
      router.dispose();
    }

    const nav = await start(STABLE);

    await nav.router.navigate("u", { id: "7" });
    table.navigate = nav.log.length;
    nav.router.dispose();

    expect(table).toStrictEqual({
      buildPath: 1,
      isActiveRoute: 1,
      canNavigateTo: 1,
      matchPath: 1,
      makeState: 1,
      buildNavigationState: 1,
      navigate: 1,
    });
  });

  it("FACE 1 — the committed state agrees with its own literal path", async () => {
    const queryOf = (p: string): string =>
      p.includes("?") ? p.slice(p.indexOf("?") + 1) : "";

    // Read the LITERAL path string. Re-matching it would read the drifting
    // default AGAIN, which is the instrument answering itself.
    for (const from of [2, 3, 4]) {
      const { router, log } = await start((n) =>
        n >= from ? "LATE" : undefined,
      );

      const state = await router.navigate("u", { id: "7" });
      const shown = queryOf(state.path);

      expect(
        Object.keys(state.search).length === 0
          ? ""
          : `tab=${String(state.search.tab)}`,
        `state.search must be what state.path shows (drift from read ${String(from)}); log ${log.join(",")}`,
      ).toBe(shown);

      router.dispose();
    }
  });

  it("FACE 2 — buildPath prints what navigate commits", async () => {
    // "Defined ONLY at read N": the direction that diverged. `buildPath` used to
    // burn read 1 inside `withholdFilledSlots` and ship read 2, while `navigate`
    // shipped read 1 — so the two doors disagreed in BOTH directions depending
    // on which read carried the value.
    // ⚠ Two routers with identical config, one per door. Sharing one would make
    // the read counter CUMULATIVE across the pair, and then a default that
    // answers differently at read 1 and read 2 legitimately gives two answers —
    // the fix guarantees one read decides one call, not that a value which
    // changes between a render and a click stays put.
    for (const only of [1, 2]) {
      const answer = (n: number): string | undefined =>
        n === only ? "GHOST" : undefined;

      const forHref = await start(answer);
      const href = forHref.router.buildPath("u", { id: "7" });

      forHref.router.dispose();

      const forNav = await start(answer);
      const committed = await forNav.router.navigate("u", { id: "7" });

      forNav.router.dispose();

      expect(
        href,
        `href must equal destination (default defined only at read ${String(only)})`,
      ).toBe(committed.path);
    }
  });

  it("CONTROL — a stable default still prints, so the cells above are not empty builds", async () => {
    const { router } = await start(STABLE);

    expect(router.buildPath("u", { id: "7" })).toBe("/u/7?tab=STABLE");

    const committed = await router.navigate("u", { id: "7" });

    expect(committed.path).toBe("/u/7?tab=STABLE");
    expect(committed.search).toStrictEqual({ tab: "STABLE" });

    router.dispose();
  });
});

/**
 * The EXPORTED FREE FUNCTIONS, which this table never covered (#1882).
 *
 * Every row above goes through a router, so a door reachable only as a bare
 * import was invisible here — and `resolveForwardChain` is a root export
 * (`src/index.ts`) that takes a route name and uses it as a PROPERTY KEY.
 *
 * ⚠ It is also the one door of the family with no validator seam: it is a free
 * function, so `@real-router/validation-plugin` cannot gate it — and the plugin
 * is itself one of its consumers. The repo's posture (bare core degrades, the
 * opt-in validator diagnoses) has nowhere to live here, which is why the fix is
 * to make the coercion HAPPEN ONCE rather than to refuse a non-string. Refusing
 * is what #1881 tried on three neighbours and what #1891 reverted; the criterion
 * in `ARCHITECTURE.md` gates only where a STABLE non-string does damage, and a
 * stable one here answers exactly what its `toString` names.
 *
 * ⚠ A stable bag is therefore VACUOUS as a test: coerced once or twice, it gives
 * the same answer as the string. Only a DRIFTING name discriminates.
 */
describe("how many times an exported free function reads a name (#1882)", () => {
  const MAP: Record<string, string> = { alias: "users", other: "home" };

  /** Answers "alias" for the first `flip` reads, then "other". */
  const driftingName = (
    flip: number,
    log: string[],
  ): { name: string; log: string[] } => {
    let reads = 0;

    const bag = {
      toString() {
        reads += 1;

        const out = reads <= flip ? "alias" : "other";

        log.push(out);

        return out;
      },
    };

    return { name: bag as unknown as string, log };
  };

  it("resolveForwardChain reads the name exactly once", () => {
    const log: string[] = [];
    const { name } = driftingName(1, log);

    resolveForwardChain(name, MAP);

    expect(
      log,
      "two reads of one question can disagree — the second indexed a route the first never named",
    ).toHaveLength(1);
  });

  it("a name that changes between reads resolves to what its FIRST read named", () => {
    const log: string[] = [];
    const { name } = driftingName(1, log);

    // Measured before the fix: `home` — the forward target of `other`, a route
    // the first read never named. `while (forwardMap[current])` tested one
    // coercion and `const next = forwardMap[current]` indexed another.
    expect(resolveForwardChain(name, MAP)).toBe("users");
  });

  it("returns a STRING when the map has no entry for the name", () => {
    // The `: string` return type was not true of the object arm: with nothing to
    // forward to, the walk handed the caller's own object straight back.
    const back = resolveForwardChain(
      { toString: () => "nope" } as unknown as string,
      MAP,
    );

    expect(typeof back).toBe("string");
    expect(back).toBe("nope");
  });

  it("CONTROL — a string caller is unaffected on every arm", () => {
    expect(resolveForwardChain("alias", MAP)).toBe("users");
    expect(resolveForwardChain("other", MAP)).toBe("home");
    expect(resolveForwardChain("home", MAP)).toBe("home");
    expect(resolveForwardChain("nowhere", MAP)).toBe("nowhere");
  });

  it("CONTROL — a chain of two hops still resolves to the end", () => {
    expect(
      resolveForwardChain("a", { a: "b", b: "c" }),
      "the walk itself must be untouched by reading the entry name once",
    ).toBe("c");
  });

  it("a HOP is read once too, not just the entry name", () => {
    // The second argument's `Record<string, string>` has exactly the status
    // `startRoute: string` has — a contract, not a runtime guarantee — and the
    // walk asked the same two questions of a hop that it used to ask of the
    // entry: the loop condition tested one value and the assignment took
    // another, then handed the raw VALUE back to the top to be read as a key
    // twice more. Measured before the fix: this resolved to `usersC`.
    const reads: string[] = [];
    let hopReads = 0;
    const hop = {
      toString() {
        hopReads += 1;

        const out = hopReads <= 1 ? "b" : "c";

        reads.push(out);

        return out;
      },
    } as unknown as string;

    expect(
      resolveForwardChain("a", { a: hop, b: "usersB", c: "usersC" }),
      "a hop resolves as its FIRST read names, exactly as the entry does",
    ).toBe("usersB");
    expect(reads).toHaveLength(1);
  });

  it("a TERMINAL hop comes back as a string, not as the map's own value", () => {
    // The mirror of the entry's `: string` arm, and the cell the first draft of
    // the hop fix did NOT have: with the hop naming a route that forwards
    // nowhere, the walk RETURNS it. One map read per iteration is not enough
    // there — it stops the double question but still hands the caller's object
    // straight back, so the coercion is what makes the declared `: string` true.
    // Found by mutation: removing `String(raw)` alone left the other hop cell
    // green.
    let reads = 0;
    const hop = {
      toString() {
        reads += 1;

        return "terminal";
      },
    } as unknown as string;

    const out = resolveForwardChain("a", { a: hop });

    expect(typeof out).toBe("string");
    expect(out).toBe("terminal");
    expect(reads).toBe(1);
  });

  it("the MAP is read once per hop, not twice", () => {
    // A third axis, and the one the other two cells do NOT cover: the CONTAINER
    // rather than the key. `while (forwardMap[current])` tested one value and
    // `const next = forwardMap[current]` took another, so an accessor- or
    // Proxy-backed map — which a caller of this free export may hand it —
    // answered the test with one route and the walk with a different one. Found
    // by mutation: restoring the double read left both hop cells green.
    let reads = 0;
    // ⚠ The annotation lives on the VARIABLE, not as an assertion on the object
    // literal. Written as `{...} as Record<string, string>`, `lint --fix` strips
    // the assertion — the rule judges by the `resolveForwardChain` parameter the
    // value ends up in, not by the `target[key]` index below — and the file then
    // stops type-checking.
    const base: Record<string, string> = {
      a: "b",
      b: "usersB",
      c: "usersC",
    };
    const map = new Proxy(base, {
      get(target, key: string): string | undefined {
        if (key === "a") {
          reads += 1;

          return reads <= 1 ? "b" : "c";
        }

        return target[key];
      },
    });

    expect(resolveForwardChain("a", map)).toBe("usersB");
    expect(reads, "one read of the map per hop, not two").toBe(1);
  });

  it("CONTROL — the walk's four other arms are untouched by the hop read", () => {
    // One map read per iteration replaced two, so every exit of the loop is
    // re-pinned: the cycle throw, the depth throw, the no-entry arm and the
    // FALSY-value arm, which is the one an `if (!raw) break` could silently
    // change.
    expect(() => resolveForwardChain("a", { a: "b", b: "a" })).toThrow(
      "Circular forwardTo: a → b → a",
    );
    expect(() =>
      resolveForwardChain("a", { a: "b", b: "c", c: "d", d: "e" }, 2),
    ).toThrow("exceeds maximum depth (2)");
    expect(resolveForwardChain("zzz", { a: "b" })).toBe("zzz");
    expect(resolveForwardChain("a", { a: "" })).toBe("a");
  });
});

/**
 * The dependency NAME, used as a property key (#1843).
 *
 * The table above counts reads of the dependency BAG — the value side, which
 * `setAll` walks. The NAME side had no row, and it is the one where the checked
 * key is not the written or deleted key.
 *
 * ⚠ NOT the route-name doctrine. `ARCHITECTURE.md` "Route-Name Type Gates"
 * governs route names, and this is a dependency name — a different channel with
 * no gate criterion of its own. What applies here is the rule core already
 * states for itself in `src/engine/CLAUDE.md`: *"a guard that admits by a
 * computed key must hand the KEY downstream, never the value it computed it
 * from"*. This API family was the one that did not.
 *
 * ⚑ The same file already applies that discipline one level up: `setDependency`
 * captures `store.dependencies` ONCE (#1859) because a validator warning can
 * reach application code that replaces it. The reference was pinned; the key was
 * not.
 */
describe("how many times a dependency NAME is coerced (#1843)", () => {
  /** A name whose `toString` yields `answers[i]` on read i. */
  const driftingKey = (answers: readonly string[], log: string[]): string => {
    let reads = 0;

    return {
      toString() {
        const out = answers[Math.min(reads, answers.length - 1)];

        reads += 1;
        log.push(out);

        return out;
      },
    } as unknown as string;
  };

  const withAlpha = (): {
    router: ReturnType<typeof createRouter>;
    deps: ReturnType<typeof getDependenciesApi>;
  } => {
    const router = createRouter([{ name: "home", path: "/home" }] as never);
    const deps = getDependenciesApi(router);

    deps.set("alpha" as never, 1 as never);

    return { router, deps };
  };

  it("set coerces the name exactly once", () => {
    const { router, deps } = withAlpha();
    const log: string[] = [];

    deps.set(
      driftingKey(["alpha", "beta", "beta"], log) as never,
      999 as never,
    );

    expect(
      log,
      "the key that is CHECKED must be the key that is WRITTEN",
    ).toHaveLength(1);

    router.dispose();
  });

  it("set writes the key it checked, and the limit check sees the same one", () => {
    const { router, deps } = withAlpha();
    const log: string[] = [];

    // Measured before the fix: `hasOwn` asked about `alpha` (present → the
    // OVERWRITE arm, so the new-key limit check was skipped) and the write then
    // landed on `beta` — a new key added without ever being counted.
    deps.set(
      driftingKey(["alpha", "beta", "beta"], log) as never,
      999 as never,
    );

    expect(deps.getAll()).toStrictEqual({ alpha: 999 });

    router.dispose();
  });

  it("set does not silently overwrite a key it never diagnosed", () => {
    const { router, deps } = withAlpha();
    const log: string[] = [];

    // The mirror direction: `hasOwn` asked about the absent `beta` (→ new-key
    // arm, no overwrite warning) and the write then destroyed `alpha`.
    deps.set(
      driftingKey(["beta", "alpha", "alpha"], log) as never,
      999 as never,
    );

    expect(deps.getAll()).toStrictEqual({ alpha: 1, beta: 999 });

    router.dispose();
  });

  it("remove deletes the key it checked", () => {
    const { router, deps } = withAlpha();

    deps.set("beta" as never, 2 as never);

    const log: string[] = [];

    // Measured before the fix: checked `alpha` (present, so no
    // "removing a non-existent dependency" warning) and deleted `beta`.
    deps.remove(driftingKey(["alpha", "beta"], log) as never);

    expect(log).toHaveLength(1);
    expect(deps.getAll()).toStrictEqual({ beta: 2 });

    router.dispose();
  });

  it("CONTROL — has already coerced once, and still does", () => {
    const { router, deps } = withAlpha();
    const log: string[] = [];

    expect(deps.has(driftingKey(["alpha", "beta"], log) as never)).toBe(true);
    expect(log).toHaveLength(1);

    router.dispose();
  });

  it("a name whose toString THROWS leaves the store untouched, on both doors", () => {
    // The coercion moved UP a statement in both doors, so this pins that the
    // throw still lands before any write and that the caller's own error
    // propagates unwrapped. Measured identical on both sides of the fix.
    const { router, deps } = withAlpha();

    deps.set("beta" as never, 2 as never);

    const boom = {
      toString() {
        throw new Error("toString exploded");
      },
    } as unknown as string;

    expect(() => {
      deps.set(boom as never, 999 as never);
    }).toThrow("toString exploded");
    expect(deps.getAll()).toStrictEqual({ alpha: 1, beta: 2 });

    expect(() => {
      deps.remove(boom as never);
    }).toThrow("toString exploded");
    expect(deps.getAll()).toStrictEqual({ alpha: 1, beta: 2 });

    router.dispose();
  });

  it("CONTROL — a SYMBOL name is not coerced, so the family still agrees", () => {
    const { router, deps } = withAlpha();
    const token = Symbol("svc");

    // ⚑ The exemption is load-bearing, not a carve-out for tidiness. A symbol
    // already IS a property key, so there is no `toString` to drift and nothing
    // to fix. Coercing it anyway (`String(token)` → `"Symbol(svc)"`) was written
    // first and measured: `set` and `remove` moved to the string while `has` and
    // `get` kept asking the symbol, so the two lines below answered `false` and
    // `undefined`. This cell fails on that edit.
    deps.set(token as never, 42 as never);

    expect(deps.has(token as never)).toBe(true);
    expect(deps.get(token as never)).toBe(42);
    // Unchanged and pre-existing: `getAll` SPREADS the store, and a spread
    // carries own enumerable symbols, so the token comes back. What does not
    // see it is `objectKeys` — `validateDependencyCount` never counts a symbol
    // dependency against the limit. Neither fact is this fix's business; the
    // cell records them so the exemption is measured rather than assumed.
    expect(deps.getAll()).toStrictEqual({ alpha: 1, [token]: 42 });

    deps.remove(token as never);

    expect(deps.has(token as never)).toBe(false);

    router.dispose();
  });

  it("CONTROL — a string name behaves exactly as before on every door", () => {
    const { router, deps } = withAlpha();

    deps.set("beta" as never, 2 as never);

    expect(deps.getAll()).toStrictEqual({ alpha: 1, beta: 2 });
    expect(deps.has("alpha" as never)).toBe(true);

    deps.remove("alpha" as never);

    expect(deps.getAll()).toStrictEqual({ beta: 2 });
    expect(deps.has("alpha" as never)).toBe(false);

    router.dispose();
  });
});

/**
 * The DOOR INVENTORY, and what it is for.
 *
 * The table above measures doors one hand-written cell at a time, and a door
 * nobody wrote a cell for is measured zero times — which reads exactly like a
 * clean door. #1901 counted the consequence: six new members of the ingestion
 * class filed in the eight days during which thirty-one were closed.
 *
 * ⚠ This arm does NOT decide whether a door reads a caller's bag twice — the
 * three derivations recorded at the top of this file each caught at most one of
 * the four sites #1911 / #1930 / #2008 name, so no scan can answer it. It
 * carries the one fact a scan CAN establish: which public doors exist. A new
 * one reds here, and whoever added it answers the question the table asks.
 *
 * ⚑ The set is DERIVED from the live surfaces, never listed twice: the walk
 * stops at `Object.prototype`, so `hasOwnProperty` and the two `__define*`
 * accessors stay out without being named.
 */
describe("the public door inventory (#1901)", () => {
  const doorsOf = (name: string, surface: object): string[] => {
    const members = new Set(Object.keys(surface));
    let proto: object | null = Object.getPrototypeOf(surface) as object | null;

    while (proto && proto !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (key !== "constructor") {
          members.add(key);
        }
      }

      proto = Object.getPrototypeOf(proto) as object | null;
    }

    return [...members]
      .filter(
        (key) =>
          typeof (surface as Record<string, unknown>)[key] === "function",
      )
      .map((key) => `${name}.${key}`);
  };

  const inventory = (): string[] => {
    const router = createRouter([{ name: "a", path: "/a" }]);

    return [
      ...doorsOf("router", router),
      ...doorsOf("getRoutesApi", getRoutesApi(router)),
      ...doorsOf("getPluginApi", getPluginApi(router)),
      ...doorsOf("getDependenciesApi", getDependenciesApi(router)),
      ...doorsOf("getLifecycleApi", getLifecycleApi(router)),
    ].toSorted((a, b) => a.localeCompare(b));
  };

  /**
   * Every public door as of today. Add a door, add its line — and while you are
   * here, ask whether it reads a key of a caller-owned object more than once,
   * and give it a cell above if it does.
   */
  const KNOWN: readonly string[] = [
    "getDependenciesApi.get",
    "getDependenciesApi.getAll",
    "getDependenciesApi.has",
    "getDependenciesApi.remove",
    "getDependenciesApi.reset",
    "getDependenciesApi.set",
    "getDependenciesApi.setAll",
    "getLifecycleApi.addActivateGuard",
    "getLifecycleApi.addDeactivateGuard",
    "getLifecycleApi.removeActivateGuard",
    "getLifecycleApi.removeDeactivateGuard",
    "getPluginApi.addEventListener",
    "getPluginApi.addInterceptor",
    "getPluginApi.buildNavigationState",
    "getPluginApi.claimContextNamespace",
    "getPluginApi.emitTransitionError",
    "getPluginApi.extendRouter",
    "getPluginApi.forwardState",
    "getPluginApi.getOptions",
    "getPluginApi.getRootPath",
    "getPluginApi.getRouteConfig",
    "getPluginApi.getTree",
    "getPluginApi.makeState",
    "getPluginApi.matchPath",
    "getPluginApi.navigateToState",
    "getPluginApi.setRootPath",
    "getRoutesApi.add",
    "getRoutesApi.clear",
    "getRoutesApi.get",
    "getRoutesApi.has",
    "getRoutesApi.remove",
    "getRoutesApi.replace",
    "getRoutesApi.subscribeChanges",
    "getRoutesApi.update",
    "router.areStatesEqual",
    "router.buildPath",
    "router.canNavigateTo",
    "router.dispose",
    "router.getPreviousState",
    "router.getState",
    "router.isActive",
    "router.isActiveRoute",
    "router.isLeaveApproved",
    "router.navigate",
    "router.navigateToDefault",
    "router.navigateToNotFound",
    "router.shouldUpdateNode",
    "router.start",
    "router.stop",
    "router.subscribe",
    "router.subscribeLeave",
    "router.usePlugin",
  ].toSorted((a, b) => a.localeCompare(b));

  it("carries exactly the doors that exist, no more and no fewer", () => {
    expect(inventory()).toStrictEqual(KNOWN);
  });

  it("CONTROL — the walk finds members, and stops at Object.prototype", () => {
    const found = inventory();

    expect(found.length).toBeGreaterThan(40);
    expect(found).not.toContain("router.hasOwnProperty");
    expect(found).not.toContain("router.__defineGetter__");
    // …and it reaches PROTOTYPE methods, not just own keys: `navigate` is on
    // the class, `add` is an own key of the routes surface.
    expect(found).toContain("router.navigate");
    expect(found).toContain("getRoutesApi.add");
  });
});

/**
 * The claim the table's own rows contradict (#1952).
 *
 * Two commit-door rows explained their `2` as "the same #1812 pair every
 * producer above pays". The producers do not pay it — #1812 removed it from
 * them, and the sentence is what stops a reader asking why two doors were left
 * on the older mechanism. A reader cannot check that against six rows scattered
 * over four hundred lines, each with its own fixture.
 *
 * ⚑ So the six are measured HERE from one fixture in one assertion: "everyone
 * pays this" is now either true in the table or visibly false, which is the
 * cell the issue asked for.
 */
describe("every door reads a caller-owned key once — one fixture, one assertion (#1952)", () => {
  it("holds for the producers and the commit doors alike", async () => {
    const routes = [
      { name: "u", path: "/u/:id?tab" },
      { name: "home", path: "/home" },
    ];
    const at: Record<string, number> = {};

    /** One door, one pair of fresh counting bags, the peak read per channel. */
    const measure = async (
      door: string,
      run: (
        router: ReturnType<typeof createRouter>,
        params: ReturnType<typeof countingBag>,
        search: ReturnType<typeof countingBag>,
      ) => Promise<void> | void,
    ): Promise<void> => {
      const router = createRouter(routes as never);

      await router.start("/home");

      const params = countingBag({ id: "7" });
      const search = countingBag({ tab: "x" });

      await run(router, params, search);

      at[`${door} · params`] = Math.max(0, ...Object.values(params.reads));
      at[`${door} · search`] = Math.max(0, ...Object.values(search.reads));
      router.dispose();
    };

    await measure("navigate", async (router, params, search) => {
      await router
        .navigate("u", params.bag as never, search.bag as never)
        .catch(() => undefined);
    });

    await measure("buildPath", (router, params, search) => {
      router.buildPath("u", params.bag as never, search.bag as never);
    });

    await measure("makeState", (router, params, search) => {
      getPluginApi(router).makeState(
        "u",
        params.bag as never,
        search.bag as never,
      );
    });

    await measure("buildNavigationState", (router, params, search) => {
      getPluginApi(router).buildNavigationState(
        "u",
        params.bag as never,
        search.bag as never,
      );
    });

    await measure("navigateToState", async (router, params, search) => {
      await getPluginApi(router)
        .navigateToState({
          name: "u",
          params: params.bag,
          search: search.bag,
          path: "/u/7?tab=x",
        } as never)
        .catch(() => undefined);
    });

    await measure("systemCommit", (router, params, search) => {
      const base = getPluginApi(router).makeState(
        "u",
        { id: "7" },
        { tab: "x" },
      ) as unknown as State;

      getInternals(router).systemCommit(
        {
          ...base,
          params: params.bag as never,
          search: search.bag as never,
        },
        router.getState(),
        {},
      );
    });

    expect(at).toStrictEqual({
      "navigate · params": 1,
      "navigate · search": 1,
      "buildPath · params": 1,
      "buildPath · search": 1,
      "makeState · params": 1,
      "makeState · search": 1,
      "buildNavigationState · params": 1,
      "buildNavigationState · search": 1,
      "navigateToState · params": 1,
      "navigateToState · search": 1,
      "systemCommit · params": 1,
      "systemCommit · search": 1,
    });
  });
});

/**
 * The chain fold asks `mergeDefined` with NO default (#1952).
 *
 * A hop that declares no `defaultParams` folds as `mergeDefined(undefined,
 * accumulated)`, and that arm hands its argument straight back. It is the only
 * caller of the arm, and the pass-through is what lets the merged branch's
 * `undefined` filter stand as the single place the fold drops a key — so an
 * edit that made the arm copy, strip or freeze would go unnoticed without this.
 */
describe("the forwardTo fold's no-default arm (#1952)", () => {
  it("a hop WITHOUT defaults, after one WITH them, keeps the accumulated value", () => {
    const router = createRouter([
      { name: "a", path: "/a", forwardTo: "b", defaultParams: { x: "1" } },
      { name: "b", path: "/b", forwardTo: "c" },
      { name: "c", path: "/c" },
    ] as never);

    expect(getPluginApi(router).forwardState("a", {}, {})).toStrictEqual({
      name: "c",
      params: { x: "1" },
      search: {},
    });

    router.dispose();
  });

  it("an accumulated default whose value is `undefined` is stripped, not shipped", () => {
    const router = createRouter([
      {
        name: "a",
        path: "/a",
        forwardTo: "b",
        defaultParams: { x: "1", gone: undefined },
      },
      { name: "b", path: "/b", forwardTo: "c" },
      { name: "c", path: "/c" },
    ] as never);

    const out = getPluginApi(router).forwardState("a", {}, {});

    expect(Object.getOwnPropertyNames(out.params)).toStrictEqual(["x"]);

    router.dispose();
  });
});
