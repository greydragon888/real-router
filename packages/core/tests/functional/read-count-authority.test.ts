import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import {
  getDependenciesApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import { countingBag, driftingBag } from "../helpers/hostileBags";

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

      router.canNavigateTo("u", params.bag);
      table["canNavigateTo · params"] = peak(params.reads);
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
      "navigate · params": 1, // normalizeParams copies before the merge sees it
      "buildPath · params": 1,
      "isActiveRoute · params": 1,
      "canNavigateTo · params": 1,
      "makeState · params": 1,
      "navigate · opts.replace": 1, // 2 on the UNKNOWN_ROUTE arc — see below
      "navigate · opts.redirected": 1,
      "navigate · opts.force": 1,
      "createRouter · options.queryParams": 1,
      "update · patch": 1, // the single destructure, #797 / #952
      "createRouter · dependencies": "refused by guardDependencies",

      // ── ABOVE 1: each is a known defect with an owner ──────────────────────

      // #1812 — the caller's query bag is read by TWO different functions, which
      // is not what that issue says and not what the obvious reading of the code
      // suggests. Traced, not inferred:
      //
      //   read 1  stripUndefined  <- mergeDefined <- mergeWithDefault
      //   read 2  mergeWithDefault (its own spread of the same bag)
      //
      // ⚠ Collapsing `mergeDefined`'s own gate-then-value pair — the site #1812
      // quotes — leaves this count at 2, measured. The path channel is immune
      // because `normalizeParams` copies before any of it runs. FOUR doors reach
      // the pair, so a fix has one home and four witnesses.
      "navigate · search": 2,
      "buildPath · search": 2,
      "isActiveRoute · search": 2,
      "makeState · search": 2,

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

      // The double read inside the copy loop — `deps[key] === undefined` as the
      // gate, then `store.dependencies[key] = deps[key]` as the value. Reachable
      // past `guardDependencies` through a Proxy or an inherited accessor (#1799
      // covers the inheritance hole; the double read is separate).
      "setAll · deps": 2,
    });
  });

  it("CONTROL — the table is populated and its counts are not all one", () => {
    // ⚑ Non-vacuity: a table this test builds itself could silently shrink to
    // nothing, and every assertion above would still pass on `{}` vs `{}`. And a
    // table where every count is 1 would mean the counting bag stopped counting —
    // the instrument failing open, which is the one failure this file cannot
    // afford.
    const router = mk();
    const search = countingBag({ tab: "x" });

    router.buildPath("u", { id: "7" }, search.bag);
    router.dispose();

    expect(Object.values(search.reads).some((count) => count > 1)).toBe(true);
  });
});
