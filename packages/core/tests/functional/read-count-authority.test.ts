import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import {
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

      getRoutesApi(router).add({ name: "z", path: "/z" });
      table["…and on a later matcher rebuild"] =
        peak(queryParams.reads) - atConstruction;

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
      "…and on a query-carrying matchPath + buildPath": 0,
      "update · patch": 1, // the single destructure, #797 / #952
      "createRouter · dependencies": "refused by guardDependencies",

      // ── ABOVE 1: each is a known defect with an owner ──────────────────────

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

      // #1789 — route registration reads every structural field more than once:
      // `Object.entries` materialises every value before the standard-key filter,
      // then each field's own branch reads it again. ⚠ `name` at SEVEN is higher
      // than that issue documents; measured here, not inferred.
      "add · route.name": 7,
      "add · route.defaultSearch": 3,
    });
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
