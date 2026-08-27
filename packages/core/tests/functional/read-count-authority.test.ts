import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingBag, driftingBag } from "../helpers/hostileBags";

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
 * Companion: `helpers/hostileBags` (the shapes), `/bugfix` Phase 4.5 vector 0.
 */
describe("how many times core reads a caller-owned key", () => {
  const ROUTES = [
    { name: "u", path: "/u/:id?tab" },
    { name: "home", path: "/home" },
  ];

  const mk = (options: object = {}): ReturnType<typeof createRouter> =>
    createRouter(ROUTES as never, options as never);

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
  const routeFor = (field: string): ReturnType<typeof countingBag> => {
    const source: Record<string, unknown> = {
      name: "z",
      path: "/z?tab",
      [field]: FIELD_VALUE[field],
    };

    if (field === "forwardTo") {
      source.children = FIELD_VALUE.children;
    }

    return countingBag(source);
  };

  const readsThroughDoor = (
    field: string,
    door: "createRouter" | "add" | "replace",
  ): number => {
    const route = routeFor(field);
    const router =
      door === "createRouter"
        ? createRouter([route.bag] as never)
        : createRouter([] as never);

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
      const route = countingBag({
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
      const route = countingBag({
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
      const router = mk();
      const deps = countingBag({ svc: 1 });

      getDependenciesApi(router).setAll(deps.bag);
      table["setAll · deps"] = peak(deps.reads);
      router.dispose();
    }
    {
      // The one door that REFUSES the shape outright — an own accessor in the
      // dependency bag is a documented `TypeError`. A door that will not accept
      // an accessor needs no read count.
      const deps = countingBag({ svc: 1 });

      try {
        createRouter(ROUTES as never, {}, deps.bag as never).dispose();
        table["createRouter · dependencies"] = peak(deps.reads);
      } catch {
        table["createRouter · dependencies"] = "refused by guardDependencies";
      }
    }

    expect(table).toStrictEqual({
      // ── 1 read: the door already snapshots, or reads once by construction ──

      // ⚑ ONE since #1816, and it belongs in THIS block now. The loop used to
      // test `deps[key] !== undefined` and then read the same key again for the
      // value it stored, so a Proxy-backed bag was ADMITTED on one value and
      // STORED with another — no inheritance needed. It now binds the value once
      // and walks the captured `objectKeys`, so there is no second read and no
      // second property set to disagree about.
      "setAll · deps": 1,
      "navigate · params": 1, // normalizeChannel builds from one read per key
      // #1812, FIXED: the query bag was read twice — `stripUndefined` tested each
      // key, then `mergeWithDefault` spread the same bag to copy it — so the key
      // was ADMITTED on one value and SHIPPED with another. Four doors reached
      // the pair; the path channel never did, because it has always arrived
      // normalised. Both channels now go through `normalizeChannel`.
      "navigate · search": 1,
      "buildPath · search": 1,
      "isActiveRoute · search": 1,
      "makeState · search": 1,
      "buildPath · params": 1,
      "isActiveRoute · params": 1,
      "canNavigateTo · params": 1,
      "canNavigateTo · search": 1,
      "buildNavigationState · params": 1,
      "buildNavigationState · search": 1,
      "makeState · params": 1,
      "navigate · opts.replace": 1, // 2 on the UNKNOWN_ROUTE arc — see below
      "navigate · opts.redirected": 1,
      "navigate · opts.force": 1,
      // ⚑ ONE, and it took TWO to notice why that matters. `deriveMatcherOptions`
      // snapshots the bag (each field once); `OptionsNamespace`'s deep-freeze used
      // to walk the same object with `Object.values` first, which INVOKES every
      // getter it passes — a read the freeze has no use for, since sealing a slot
      // needs no value. The second read was not merely wasteful: a getter that
      // re-enters `createRouter` branched twice per level instead of once, so a
      // re-entrant bag went from n calls to 2ⁿ and stopped terminating at a depth
      // that used to be instant. The walk reads descriptors now.
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
      "createRouter · dependencies": "refused by guardDependencies",

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
      // ⚠ TWO, and BOTH are inside the copy: `stripUndefined` tests the value,
      // then the copy loop takes it. Traced, not inferred — an earlier revision
      // of this comment blamed the P3 channel guard for the first read, and for
      // this bag the guard reads NOTHING: `findMisChanneledKey` walks the
      // route's declared query names (`tab`) and `Object.hasOwn(params, "tab")`
      // is false. Same #1812 pair every producer above pays.
      "navigateToState · params": 2,
      "navigateToState · search": 2,

      // ⚠ THREE, and this is the door's real worst case — the row above cannot
      // see it. The guard DOES read, but only a key the route declares with `?`
      // and only until it finds a defined value, so a bag that answers
      // `undefined` on that first read passes the check and is then read twice
      // more by the copy. Measured live at this count: the committed
      // `state.params` carries `tab: "SHIPPED"`, a value the guard never saw,
      // in the channel the guard exists to keep it out of — while `state.path`
      // stays `/u/7` and shows nothing. That is the read-twice class this door
      // shares with `navigate`, explicitly OUTSIDE the `__proto__` guarantee
      // (see `UNSAFE_KEY` in `constants.ts`): recorded rather than closed,
      // because closing it costs the same discipline at every door and buys a
      // shape only the caller can create.
      "navigateToState · params, declared key answering undefined": 3,

      // The fourth door pays the same #1812 pair and nothing more: it runs no
      // channel guard, so neither number carries the third read its sibling's
      // armed row does. Both reads are inside `mergeWithDefault` —
      // `stripUndefined` tests the value, the copy loop takes it.
      "systemCommit · params": 2,
      "systemCommit · search": 2,

      // §4.1 of the RFC — `executeNavigation` hoists `const reload = opts.reload`
      // (#1719) and then `isSameNavigation` reads `opts.reload` again to decide
      // the SAME_STATES short-circuit. `packages/core/CLAUDE.md` asserts this is
      // 1. It is not, and `state.transition.reload` can record the value that did
      // NOT decide the outcome.
      "navigate · opts.reload": 2,

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
    // measure `stripUndefined` + `mergeWithDefault`'s copy loop. A route WITH a
    // default takes neither: `mergeDefined` does its own gate-then-take, and the
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
    // ⚠ WHICH walk changed under #1812, and the comment here used to name the
    // old one. It said `stripUndefined`; since both channels are routed through
    // `normalizeChannel` before the merge, this door reaches `normalizeChannel`'s
    // `hasOwn` and `stripUndefined` is not on the path at all. The assertion is
    // unchanged and still discriminates — it is the JUSTIFICATION that moved, and
    // a rationale naming a function the cell no longer executes is the shape that
    // survives a refactor while quietly guarding something else.
    const router = mk();

    await router.start("/home");

    let ghostReads = 0;
    let keepReads = 0;

    const proto = {};

    // ⚠ The QUERY channel — kept as the fixture, though since #1812 the two
    // channels take the same route and `params` would now discriminate too.
    // Before it, sending this through `params` was green either way, because the
    // path normaliser asked its own `hasOwn` first and `stripUndefined` never saw
    // the inherited name. Measured both ways
    // before choosing.
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
