import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { createTestRouter } from "../../helpers";

import type { Params, Router } from "@real-router/core";
import type { RoutesApi } from "@real-router/core/api";

let router: Router;
let routesApi: RoutesApi;

describe("core/routes/routeQuery/isActiveRoute", () => {
  beforeEach(async () => {
    router = createTestRouter();
    routesApi = getRoutesApi(router);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("isActiveRoute", () => {
    it("should return true for current active route", async () => {
      expect(router.isActiveRoute("home")).toBe(true);
    });

    it("should return false for non-active route", async () => {
      expect(router.isActiveRoute("sign-in")).toBe(false);
    });

    it("should respect strictEquality", async () => {
      await router.navigate("sign-in");

      expect(router.isActiveRoute("home", {}, undefined, true)).toBe(false);
    });

    it("should return false if router was not started", async () => {
      router.stop();

      expect(router.isActiveRoute("test", {})).toBe(false);
    });

    it("should return false if router was started and default state was not defined", async () => {
      router.stop();

      router = createRouter();
      await router.start("/");

      expect(router.isActiveRoute("test", {})).toBe(false);
    });

    describe("hierarchy (strictEquality=false)", () => {
      it("should return true for parent route when child is active", async () => {
        await router.navigate("users.view", { id: "123" });

        expect(router.isActiveRoute("users")).toBe(true);
      });

      it("should return false for parent with strictEquality=true when child is active", async () => {
        await router.navigate("users.view", { id: "123" });

        expect(router.isActiveRoute("users", {}, undefined, true)).toBe(false);
      });

      it("should return false for sibling route when another sibling is active", async () => {
        await router.navigate("users.list");

        // users.view requires id param, but we're checking if it's active
        expect(router.isActiveRoute("users.view", { id: "123" })).toBe(false);
      });

      it("should return true when parent params match child params", async () => {
        await router.navigate("users.view", { id: "123" });

        // Parent route check with matching param
        expect(router.isActiveRoute("users", { id: "123" })).toBe(true);
      });

      it("should return false when parent params do not match child params", async () => {
        await router.navigate("users.view", { id: "123" });

        // Parent route check with different param
        expect(router.isActiveRoute("users", { id: "456" })).toBe(false);
      });

      it("should return true for multiple levels of hierarchy", async () => {
        // Using existing nested routes from testRouters
        await router.navigate("section.view", {
          section: "section1",
          id: "123",
        });

        // All ancestors should be considered active
        expect(router.isActiveRoute("section", { section: "section1" })).toBe(
          true,
        );
        expect(
          router.isActiveRoute("section.view", {
            section: "section1",
            id: "123",
          }),
        ).toBe(true);
      });
    });

    describe("ignoreQueryParams", () => {
      it("should ignore query params by default (ignoreQueryParams=true)", async () => {
        await router.navigate(
          "section.query",
          { section: "section1" },
          { param1: "value1", param2: "value2", param3: "value3" },
        );

        // Check with only URL param, ignoring query params
        expect(
          router.isActiveRoute("section.query", { section: "section1" }),
        ).toBe(true);
      });

      it("should consider query params when ignoreQueryParams=false", async () => {
        await router.navigate(
          "section.query",
          { section: "section1" },
          { param1: "value1", param2: "value2", param3: "value3" },
        );

        // With ignoreQueryParams=false, all params must match
        expect(
          router.isActiveRoute(
            "section.query",
            { section: "section1" },
            undefined,
            false,
            false,
          ),
        ).toBe(false);

        // All params match — spelled in the channels the route declares them
        // in. Since Phase 2 step 2-5 this predicate no longer re-routes a
        // declared query key out of the params bag, so the query half must be
        // handed through the query slot (the v1 single-bag spelling below is
        // retired and answers false).
        expect(
          router.isActiveRoute(
            "section.query",
            { section: "section1" },
            { param1: "value1", param2: "value2", param3: "value3" },
            false,
            false,
          ),
        ).toBe(true);

        expect(
          router.isActiveRoute(
            "section.query",
            {
              section: "section1",
              param1: "value1",
              param2: "value2",
              param3: "value3",
            },
            undefined,
            false,
            false,
          ),
        ).toBe(false);
      });

      it("should return false when query params differ and ignoreQueryParams=false", async () => {
        await router.navigate(
          "section.query",
          { section: "section1" },
          { param1: "value1", param2: "value2", param3: "value3" },
        );

        // Different query param value
        expect(
          router.isActiveRoute(
            "section.query",
            {
              section: "section1",
              param1: "different",
              param2: "value2",
              param3: "value3",
            },
            undefined,
            false,
            false,
          ),
        ).toBe(false);
      });
    });

    describe("defaultParams in exact match", () => {
      it("should work without defaultParams (false branch coverage)", async () => {
        // home route has no defaultParams - test isActiveRoute still works
        expect(router.isActiveRoute("home")).toBe(true);
      });

      it("should merge defaultParams with provided params", async () => {
        // withDefaultParam has defaultParams: { param: "hello" }
        await router.navigate("withDefaultParam");

        // Should merge defaultParams with empty params
        expect(router.isActiveRoute("withDefaultParam")).toBe(true);
        expect(router.isActiveRoute("withDefaultParam", {})).toBe(true);

        // With strictEquality, should still work
        expect(
          router.isActiveRoute("withDefaultParam", {}, undefined, true),
        ).toBe(true);
      });
    });

    describe("defaultParams in hierarchical check", () => {
      beforeEach(async () => {
        // Add a parent route with defaultParams and a child route
        routesApi.add({
          name: "usersWithDefaults",
          path: "/users-with-defaults",
          defaultParams: { filter: "active" },
          children: [{ name: "view", path: "/view/:id" }],
        });
      });

      it("should use defaultParams when checking parent route", async () => {
        // Navigate to child route with matching params
        await router.navigate("usersWithDefaults.view", {
          id: "123",
          filter: "active",
        });

        // Parent with matching defaultParams should be active
        expect(router.isActiveRoute("usersWithDefaults")).toBe(true);
      });

      it("should return false when defaultParams do not match active state", async () => {
        // Navigate to child route with different params
        await router.navigate("usersWithDefaults.view", {
          id: "123",
          filter: "inactive",
        });

        // Parent with non-matching defaultParams should not be active
        expect(router.isActiveRoute("usersWithDefaults")).toBe(false);
      });

      it("should prefer provided params over defaultParams", async () => {
        // Navigate to child route with different filter
        await router.navigate("usersWithDefaults.view", {
          id: "123",
          filter: "inactive",
        });

        // Providing explicit params should override defaultParams
        expect(
          router.isActiveRoute("usersWithDefaults", { filter: "inactive" }),
        ).toBe(true);
        expect(
          router.isActiveRoute("usersWithDefaults", { filter: "active" }),
        ).toBe(false);
      });
    });

    describe("ignoreQueryParams in hierarchical check", () => {
      beforeEach(async () => {
        // Parent route with a query-typed defaultParam, plus a child route
        // that does NOT inherit the query default into its matched state.
        routesApi.add({
          name: "products",
          path: "/products?sort",
          // `sort` is query-declared → defaultSearch (RFC-4 M2 / #1548, rule 1).
          defaultSearch: { sort: "asc" },
          children: [{ name: "detail", path: "/:id" }],
        });
      });

      it("treats ancestor link as active when descendant lacks the query default (ignoreQueryParams=true)", async () => {
        await router.navigate("products.detail", { id: "6" });

        // /products/6 → state.params = { id: "6" } (no sort).
        // Parent has defaultParams.sort = "asc"; with ignoreQueryParams=true
        // the query-typed default must be stripped before comparison so the
        // ancestor link still highlights as active.
        expect(
          router.isActiveRoute("products", {}, undefined, false, true),
        ).toBe(true);
      });

      it("still enforces query default when ignoreQueryParams=false", async () => {
        await router.navigate("products.detail", { id: "6" });

        expect(
          router.isActiveRoute("products", {}, undefined, false, false),
        ).toBe(false);
      });

      it("treats descendant link as inactive when current state is the parent", async () => {
        // At /products (parent), a Link pointing DEEPER (products.detail) is
        // a navigation option, not active. The hierarchical block must
        // reject the "name is descendant of activeName" relation.
        await router.navigate("products");

        expect(router.isActiveRoute("products.detail")).toBe(false);
      });

      it("preserves URL-typed defaults during the strip (URL key first)", async () => {
        // Mixed defaults split by channel (RFC-4 M2 / #1548, rule 1): the
        // path-typed `slot` stays in defaultParams (always enforced), the
        // query-declared `q` moves to defaultSearch (stripped when
        // ignoreQueryParams=true). The parent link stays active iff `slot` matches.
        routesApi.add({
          name: "mixedA",
          path: "/mixedA/:slot?q",
          defaultParams: { slot: "a" },
          defaultSearch: { q: "x" },
          children: [{ name: "leaf", path: "/leaf" }],
        });

        await router.navigate("mixedA.leaf", { slot: "b" });

        expect(router.isActiveRoute("mixedA", {}, undefined, false, true)).toBe(
          false,
        );

        await router.navigate("mixedA.leaf", { slot: "a" });

        expect(router.isActiveRoute("mixedA", {}, undefined, false, true)).toBe(
          true,
        );
      });

      it("strips multiple consecutive query defaults", async () => {
        // Two query-declared defaults (`a`, `b`) move to defaultSearch; the
        // non-query `slot` stays in defaultParams (RFC-4 M2 / #1548, rule 1).
        // With ignoreQueryParams=true both query defaults are stripped, leaving
        // only the path-channel `slot` to be enforced.
        routesApi.add({
          name: "twoQ",
          path: "/twoQ?a&b&:slot",
          defaultParams: { slot: "x" },
          defaultSearch: { a: "1", b: "2" },
          children: [{ name: "leaf", path: "/leaf" }],
        });

        await router.navigate("twoQ.leaf", { slot: "x" });

        // Both `a` and `b` are query defaults → stripped; URL slot enforced.
        expect(router.isActiveRoute("twoQ", {}, undefined, false, true)).toBe(
          true,
        );
      });

      it("keeps defaults untouched when none are query-typed (url-only meta)", async () => {
        // Route meta is non-empty (`:slot` is url-typed) but defaultParams
        // carry no query-typed key — the strip probe scans them all, finds
        // nothing to strip, and the defaults are compared as-is.
        routesApi.add({
          name: "urlOnly",
          path: "/urlOnly/:slot",
          defaultParams: { slot: "a" },
          children: [{ name: "leaf", path: "/leaf" }],
        });

        await router.navigate("urlOnly.leaf", { slot: "a" });

        expect(
          router.isActiveRoute("urlOnly", {}, undefined, false, true),
        ).toBe(true);
      });

      it("preserves URL-typed defaults during the strip (query key first)", async () => {
        // Same split as mixedA, query key declared first (RFC-4 M2 / #1548,
        // rule 1): query-declared `q` → defaultSearch, path-typed `slot` →
        // defaultParams. The parent link stays active iff `slot` matches.
        routesApi.add({
          name: "mixedB",
          path: "/mixedB/:slot?q",
          defaultParams: { slot: "a" },
          defaultSearch: { q: "x" },
          children: [{ name: "leaf", path: "/leaf" }],
        });

        await router.navigate("mixedB.leaf", { slot: "a" });

        expect(router.isActiveRoute("mixedB", {}, undefined, false, true)).toBe(
          true,
        );

        await router.navigate("mixedB.leaf", { slot: "b" });

        expect(router.isActiveRoute("mixedB", {}, undefined, false, true)).toBe(
          false,
        );
      });
    });

    describe("edge cases: param value types", () => {
      it("should not match when param value is undefined (undefined !== string)", async () => {
        await router.navigate("users.view", { id: "123" });

        // undefined in params means "id must be undefined", not "skip this check"
        expect(router.isActiveRoute("users.view", { id: undefined })).toBe(
          false,
        );
      });

      it("should not match when param is omitted for exact match (areStatesEqual compares URL params)", async () => {
        await router.navigate("users.view", { id: "123" });

        // For exact match (same name), areStatesEqual is used
        // With ignoreQueryParams=true, only URL params are compared
        // "id" is a URL param, so {} !== { id: "123" }
        expect(router.isActiveRoute("users.view", {})).toBe(false);

        // But parent route check works with empty params (hierarchical check)
        expect(router.isActiveRoute("users", {})).toBe(true);
      });

      it("should match a number against the same value as a string (#1554)", async () => {
        await router.navigate("users.view", { id: "123" });

        // Provenance tolerance (#1554): `123` and `"123"` build the same path
        // (`/users/123`), so the comparison must not depend on which side wrote
        // a string — the URL decode always does, a caller often does not. This
        // replaced the former strict-`===` pin (`number !== string`).
        expect(router.isActiveRoute("users.view", { id: 123 })).toBe(true);

        // Still discriminating: a value that prints differently stays unequal.
        expect(router.isActiveRoute("users.view", { id: 124 })).toBe(false);
      });

      it("should not match null against string param", async () => {
        await router.navigate("users.view", { id: "123" });

        // null !== "123"
        expect(router.isActiveRoute("users.view", { id: null })).toBe(false);
      });

      it("should handle undefined in hierarchical check (parent route)", async () => {
        await router.navigate("users.view", { id: "123" });

        // `undefined` is ABSENCE, not a value to match against (#1550 / #1551).
        // Step 2-5 put this predicate on the same `canonicalize` every other
        // producer uses, and its path-channel entry guard strips undefined-valued
        // keys — so `{ id: undefined }` says nothing about `id` and the ancestor
        // stays active. Before, this one predicate read it as "id must BE
        // undefined", which was the last place in core where undefined meant
        // something other than absence.
        expect(router.isActiveRoute("users", { id: undefined })).toBe(true);

        // But checking with matching value works
        expect(router.isActiveRoute("users", { id: "123" })).toBe(true);
      });
    });

    describe("root node and boolean validation", () => {
      it("should handle root node empty string and warn", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Root node ("") is not considered a parent of any named route
        expect(router.isActiveRoute("")).toBe(false);

        // Should warn about empty string usage
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('isActiveRoute("") called with empty string'),
        );

        warnSpy.mockClear();

        await router.navigate("users.view", { id: "123" });

        expect(router.isActiveRoute("")).toBe(false);
        expect(warnSpy).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
      });

      it("should accept valid boolean values", async () => {
        await router.navigate("users.view", { id: "123" });

        // Explicit boolean values work correctly
        expect(router.isActiveRoute("users", {}, undefined, false)).toBe(true); // hierarchical
        expect(router.isActiveRoute("users", {}, undefined, true)).toBe(false); // strict

        expect(
          router.isActiveRoute(
            "users.view",
            { id: "123" },
            undefined,
            false,
            true,
          ),
        ).toBe(true);
        expect(
          router.isActiveRoute(
            "users.view",
            { id: "123" },
            undefined,
            false,
            false,
          ),
        ).toBe(true);
      });
    });

    describe("inherited properties", () => {
      it("should ignore non-enumerable properties", async () => {
        await router.navigate("users.view", { id: "123" });

        const params: { id: string; hidden?: string } = { id: "123" };

        Object.defineProperty(params, "hidden", {
          value: "secret",
          enumerable: false,
        });

        // Non-enumerable properties are not iterated by for-in
        expect(router.isActiveRoute("users.view", params)).toBe(true);
      });
    });

    describe("defaultParams interaction with undefined", () => {
      beforeEach(async () => {
        // Add a parent route with defaultParams and a child route
        routesApi.add({
          name: "usersFiltered",
          path: "/users-filtered",
          defaultParams: { filter: "active" },
          children: [{ name: "view", path: "/view/:id" }],
        });
      });

      it("should allow undefined to override defaultParams", async () => {
        // Navigate with the default filter
        await router.navigate("usersFiltered.view", {
          id: "123",
          filter: "active",
        });

        // `undefined` is ABSENCE on both sides of the merge (#1550 / #1551), so
        // it does NOT override the route default — the default keeps the slot and
        // matches the active state. Renamed in step 2-5: the predicate now shares
        // `canonicalize` with every other producer, where this rule has always
        // held; it used to be the one place that read undefined as a value.
        expect(
          router.isActiveRoute("usersFiltered", {
            filter: undefined,
          }),
        ).toBe(true);
      });

      it("should use defaultParams when param is not provided", async () => {
        await router.navigate("usersFiltered.view", {
          id: "123",
          filter: "active",
        });

        // Empty params → effectiveParams = { filter: "active" }
        // Matches activeState.params.filter = "active"
        expect(router.isActiveRoute("usersFiltered", {})).toBe(true);
      });

      it("should use provided params over defaultParams", async () => {
        await router.navigate("usersFiltered.view", {
          id: "123",
          filter: "inactive",
        });

        // Explicit filter overrides default
        expect(
          router.isActiveRoute("usersFiltered", { filter: "inactive" }),
        ).toBe(true);
        expect(
          router.isActiveRoute("usersFiltered", { filter: "active" }),
        ).toBe(false);
      });
    });
  });

  describe("defaultSearch hierarchical (#1549)", () => {
    it("parent defaultSearch must match the active descendant when query is not ignored", async () => {
      routesApi.add({
        name: "tagged",
        path: "/tagged?tag",
        defaultSearch: { tag: "on" },
        children: [{ name: "view", path: "/view/:id" }],
      });

      // Active descendant carries the parent's query default (tag=on): with query
      // considered (ignoreQueryParams=false), the parent's defaultSearch matches
      // the active descendant → the parent is active.
      await router.navigate("tagged.view", { id: "1" }, { tag: "on" });

      expect(router.isActiveRoute("tagged", {}, {}, false, false)).toBe(true);

      // Descendant carries a DIFFERENT query value → the parent's defaultSearch no
      // longer matches → the parent is not active (query-sensitive).
      await router.navigate("tagged.view", { id: "2" }, { tag: "off" });

      expect(router.isActiveRoute("tagged", {}, {}, false, false)).toBe(false);
    });
  });

  describe("forwardTo destination arm (#1573)", () => {
    /**
     * `isActiveRoute` compared the given name against the committed state and
     * never resolved `forwardTo`, so a `<Link to="alias">` was dark on the very
     * page it navigates to.
     *
     * The arm is a FALLBACK — `literal || destination` — and the destination is
     * a repeat of the SAME predicate on the full output of stage ①, i.e. the
     * resolved name together with the chain's defaults layered into the
     * target's channels. Substituting only the name does not work: the default
     * lives on the SOURCE route and is layered by `forwardState`, never by the
     * forward map, and a dynamic `forwardTo` is not in that map at all.
     */
    afterEach(() => {
      router.stop();
    });

    it("highlights an alias whose chain default is layered into a PATH slot", async () => {
      router = createRouter([
        { name: "home", path: "/home" },
        { name: "d2", path: "/d2/:z" },
        { name: "s2", path: "/s2", forwardTo: "d2", defaultParams: { z: "5" } },
      ]);
      await router.start("/home");

      const state = await router.navigate("s2", {});

      expect(state.path).toBe("/d2/5");
      // The link the user clicked lands exactly here, so it must read active.
      expect(router.isActiveRoute("s2", {})).toBe(true);
    });

    it("highlights an alias whose chain default is layered into the QUERY channel", async () => {
      router = createRouter([
        { name: "home", path: "/home" },
        { name: "d", path: "/d?z" },
        { name: "s", path: "/s", forwardTo: "d", defaultSearch: { z: "5" } },
      ]);
      await router.start("/home");

      const state = await router.navigate("s", {});

      expect(state.path).toBe("/d?z=5");
      // Sharper than the path case: the arm matches only if the repeat carries
      // the SEARCH channel too. The hop spells the default in `defaultSearch`,
      // the slot that says "query" — nothing is routed by the target, so the
      // predicate and the navigation read the same two channels.
      expect(router.isActiveRoute("s", {}, {}, false, false)).toBe(true);
    });

    it("highlights an alias whose forwardTo is DYNAMIC", async () => {
      router = createRouter([
        { name: "home", path: "/home" },
        { name: "d3", path: "/d3" },
        { name: "dyn", path: "/dyn", forwardTo: () => "d3" },
      ]);
      await router.start("/home");
      await router.navigate("dyn", {});

      // A function target is absent from the static forward map entirely.
      expect(router.isActiveRoute("dyn", {})).toBe(true);
    });

    it("keeps a section link lit when a SIBLING descendant is active", async () => {
      router = createRouter([
        { name: "home", path: "/home" },
        {
          name: "users",
          path: "/users",
          forwardTo: "users.list",
          children: [
            { name: "list", path: "/list" },
            { name: "profile", path: "/profile/:id" },
          ],
        },
      ]);
      await router.start("/home");
      await router.navigate("users.profile", { id: "7" });

      // The literal arm answers this one. Resolving BEFORE comparing (instead
      // of falling back) would send `users` to `users.list` and darken the
      // section link — which is why the arm is a fallback, not a replacement.
      expect(router.isActiveRoute("users")).toBe(true);
    });

    it("stays false when the alias lands on a DIFFERENT page", async () => {
      router = createRouter([
        { name: "home", path: "/home" },
        { name: "other", path: "/other" },
        { name: "alias", path: "/alias", forwardTo: "other" },
        { name: "elsewhere", path: "/elsewhere" },
      ]);
      await router.start("/home");
      await router.navigate("elsewhere", {});

      // Discrimination: the arm must not turn the predicate into a tautology.
      expect(router.isActiveRoute("alias")).toBe(false);
      expect(router.isActiveRoute("other")).toBe(false);
    });

    it("answers false, not throws, when a dynamic forwardTo callback throws", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router = createRouter([
        { name: "home", path: "/home" },
        {
          name: "boom",
          path: "/boom",
          forwardTo: () => {
            throw new Error("dynamic forward exploded");
          },
        },
      ]);
      await router.start("/home");

      // A predicate on the render path must never throw — six adapters call it
      // for every `<Link>`.
      expect(() => router.isActiveRoute("boom")).not.toThrow();
      expect(router.isActiveRoute("boom")).toBe(false);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // #1595 — the `forwardTo` arm is gated on a TREE-WIDE `hasAnyForward` flag, so
  // the render path never touches the two dictionary-mode forward maps in a tree
  // that has no forwarding route. The flag is derived state, and a stale `false`
  // is a correctness bug wearing a performance change's clothes: the arm silently
  // stops running and a `<Link>` to a forwarding route renders inactive again —
  // exactly the defect #1573 shipped the arm to fix.
  //
  // Every route-CRUD path that can introduce the FIRST forwarding route into a
  // tree that had none is pinned here, because that is the transition the flag
  // must observe. Mutationally validated: pinning `hasAnyForward` to its initial
  // value fails every case below.
  describe("forwardTo arm survives route-CRUD (#1595)", () => {
    /** A tree with NO forwarding route — `hasAnyForward` starts false. */
    function plainRouter(): Router {
      return createRouter([
        { name: "home", path: "/home" },
        { name: "dst", path: "/dst" },
      ]);
    }

    it("add() introduces the first forwarding route", async () => {
      const r = plainRouter();

      getRoutesApi(r).add([{ name: "src", path: "/src", forwardTo: "dst" }]);
      await r.start("/src");

      expect(r.getState()?.name).toBe("dst");
      expect(r.isActiveRoute("src")).toBe(true);
    });

    it("update() adds forwardTo to an existing route", async () => {
      const r = plainRouter();

      getRoutesApi(r).add([{ name: "src", path: "/src" }]);
      getRoutesApi(r).update("src", { forwardTo: "dst" });
      await r.start("/src");

      expect(r.getState()?.name).toBe("dst");
      expect(r.isActiveRoute("src")).toBe(true);
    });

    it("replace() swaps in a tree that forwards", async () => {
      const r = plainRouter();

      await r.start("/home");
      getRoutesApi(r).replace([
        { name: "home", path: "/home" },
        { name: "dst", path: "/dst" },
        { name: "src", path: "/src", forwardTo: "dst" },
      ]);
      await r.navigate("src");

      expect(r.getState()?.name).toBe("dst");
      expect(r.isActiveRoute("src")).toBe(true);
    });

    it("cloneRouter carries the arm — the SSR path is not route-CRUD (#1800)", async () => {
      // ⚑ The enumeration in this block is "route-CRUD that introduces the FIRST
      // forwarding route", and `cloneRouter` sits outside it — which is why the
      // flag was missed there. The clone's store is built from
      // `routeTreeToDefinitions(sourceStore.tree)`, i.e. bare
      // `{name, path, children}` with NO `forwardTo`, so it starts at
      // `hasAnyForward = false`; the config copy then installs the forward
      // config behind the flag's back.
      //
      // It matters on the one path SSR uses: `createRequestScope` clones per
      // request, so a `<Link to="src">` renders without its active class in the
      // server HTML while the client's own `createRouter` says active.
      //
      // ⚠ It self-heals the moment anything re-derives the flag — measured,
      // `add` and `replace` do, and an `update` that touches `forwardTo` does;
      // a non-forward `update` does not, which is harmless since the config it
      // derives from is unchanged. So any cell that mutates routes on a clone
      // before asserting cannot see the bug. This one must not.
      const base = plainRouter();

      getRoutesApi(base).add([{ name: "src", path: "/src", forwardTo: "dst" }]);
      await base.start("/dst");

      const clone = cloneRouter(base);

      await clone.start("/dst");

      expect(base.isActiveRoute("src")).toBe(true);
      expect(clone.isActiveRoute("src")).toBe(true);

      // The invariant itself: the flag and the forward config are two views of
      // one thing, so a clone that carries the config must carry the flag.
      const cloneStore = getInternals(clone).routeGetStore();

      expect(Object.keys(cloneStore.config.forwardMap)).toContain("src");
      expect(cloneStore.hasAnyForward).toBe(true);

      // ⚑ NOT the source's map object. `adoptForwardState` ASSIGNS what it is
      // handed, so the obvious simplification —
      // `adoptForwardState(newStore, resolvedForwardMap)` — installs the
      // SOURCE's map by reference and aliases the two stores. Measured: without
      // the `not.toBe` below that simplification passes the whole package.
      //
      // ⚠ The precise property is "not the source's", not "the clone's own": a
      // mutant passing a fresh `Object.create(null)` is green here and harmless.
      // The other half — that the map keeps a NULL prototype — is enforced by
      // `guard-factory-records-1801.test.ts`, whose `__proto__` / `constructor`
      // route-name cells red if this becomes a `{}`-backed object.
      const baseStore = getInternals(base).routeGetStore();

      expect(cloneStore.resolvedForwardMap).not.toBe(
        baseStore.resolvedForwardMap,
      );

      // ⚠ No "mutate the clone, check the base" assertion here, deliberately:
      // it is vacuous under a single fault. Every re-derivation path ASSIGNS a
      // fresh map, so a clone that shares the source's object drops it on the
      // next `add` instead of writing through — the base can never be polluted
      // unless a second, independent fault makes that path merge in place.

      clone.dispose();
      base.dispose();
    });

    it("a clone carries a DYNAMIC forwardTo too — the gate reads both maps", async () => {
      // ⚑ `anyForwardConfigured` ORs `forwardMap` and `forwardFnMap`, and every
      // other clone cell here uses a static `forwardTo`, so the second half was
      // unpinned: deriving the flag from `forwardMap` alone passes the suite
      // AND the generative property (whose fixture forwards statically).
      // The route-CRUD block above pins both arms; this is the same enumeration
      // gap one level down — the very thing #1800 is about.
      const base = plainRouter();

      getRoutesApi(base).add([
        { name: "dyn", path: "/dyn", forwardTo: () => "dst" },
      ]);
      await base.start("/dst");

      const clone = cloneRouter(base);

      await clone.start("/dst");

      const cloneStore = getInternals(clone).routeGetStore();

      // The static half is genuinely empty — otherwise this cell would pass for
      // the wrong reason.
      expect(Object.keys(cloneStore.config.forwardMap)).toHaveLength(0);
      expect(Object.keys(cloneStore.config.forwardFnMap)).toContain("dyn");
      expect(cloneStore.hasAnyForward).toBe(true);
      expect(clone.isActiveRoute("dyn")).toBe(true);

      clone.dispose();
      base.dispose();
    });

    it("a definition guard compiled during the clone already sees the gate", async () => {
      // ⚑ Placement, and nothing pinned it: moving the forward-state install to
      // the END of `cloneRouter` — past `setRootPath` and both guard-registration
      // loops — passes the suite. It is not equivalent. `compileFactory`
      // INVOKES definition-guard factories eagerly with the clone's router, so a
      // factory that reads the store observes the clone mid-construction. The
      // neighbouring comment in `cloneRouter` already states the rule for
      // "encoders/decoders/defaultParams/custom fields"; forward state joined
      // that region and needs the same guarantee.
      const seen: boolean[] = [];
      const base = createRouter([
        { name: "dst", path: "/dst" },
        {
          name: "src",
          path: "/src",
          forwardTo: "dst",
          canActivate: (r) => {
            seen.push(getInternals(r).routeGetStore().hasAnyForward);

            return () => true;
          },
        },
      ]);

      await base.start("/dst");
      seen.length = 0;

      const clone = cloneRouter(base);

      expect(seen).toStrictEqual([true]);

      clone.dispose();
      base.dispose();
    });

    it("a clone of a tree with NO forwarding route keeps the gate shut", async () => {
      // ⚑ The other half of the flag, and the reason it exists: it is a
      // PERFORMANCE gate that keeps `isActiveRoute` off two dictionary-mode maps
      // for trees that never forward. Setting it unconditionally on the clone
      // fixes the bug above and defeats the gate — measured, that also passes
      // the suite. It has to be DERIVED from the config, not asserted.
      const base = plainRouter();

      await base.start("/home");

      const clone = cloneRouter(base);
      const cloneStore = getInternals(clone).routeGetStore();

      expect(Object.keys(cloneStore.config.forwardMap)).toHaveLength(0);
      expect(cloneStore.hasAnyForward).toBe(false);

      clone.dispose();
      base.dispose();
    });

    it("a dynamic forwardTo callback counts too", async () => {
      const r = plainRouter();

      getRoutesApi(r).add([
        { name: "src", path: "/src", forwardTo: () => "dst" },
      ]);
      await r.start("/src");

      expect(r.getState()?.name).toBe("dst");
      expect(r.isActiveRoute("src")).toBe(true);
    });

    it("clear() + add() re-arms after the flag was reset", async () => {
      const r = createRouter([
        { name: "home", path: "/home" },
        { name: "dst", path: "/dst" },
        { name: "src", path: "/src", forwardTo: "dst" },
      ]);

      getRoutesApi(r).clear();
      getRoutesApi(r).add([
        { name: "dst", path: "/dst" },
        { name: "src", path: "/src", forwardTo: "dst" },
      ]);
      await r.start("/src");

      expect(r.getState()?.name).toBe("dst");
      expect(r.isActiveRoute("src")).toBe(true);
    });

    it("the arm stays OFF for a tree that never forwards", async () => {
      const r = plainRouter();

      await r.start("/home");

      expect(r.isActiveRoute("dst")).toBe(false);
      expect(r.isActiveRoute("home")).toBe(true);
    });
  });

  // ── #1978 ────────────────────────────────────────────────────────────────
  //
  // A key the route declares in NEITHER channel stays in `state.params` as
  // app-level data (#1579) and never reaches `state.path`, so it is not part of
  // the location this predicate answers about. Under `ignoreQueryParams: false`
  // the exact arm used to borrow `areStatesEqual`'s OTHER question — state
  // IDENTITY over the whole `params` bag (#515 / #478) — and such a key decided
  // the verdict.
  describe("a key declared in neither channel (#1978)", () => {
    beforeEach(async () => {
      // committed at `users.view` with `tab` riding in the params bag
      await router.navigate("users.view", { id: "7", tab: "settings" });
    });

    it("does not make a link to the current route inactive", () => {
      const current = router.getState()!;

      expect(current.path).toBe("/users/view/7");
      expect(current.params).toStrictEqual({ id: "7", tab: "settings" });

      // `strictEquality: true, ignoreQueryParams: false` is the exact call
      // `navigateWithHash` makes (`shared/dom-utils/link-utils.ts`).
      expect(
        router.isActiveRoute(
          "users.view",
          { id: "7" },
          current.search,
          true,
          false,
        ),
      ).toBe(true);
    });

    // The DISCRIMINATOR for the defect: on one state, one key, the two arms of
    // this one predicate disagreed — the ancestor link answered `true` while the
    // link to the route the user is ON answered `false`.
    it("makes both arms agree about one location", () => {
      const current = router.getState()!;
      const exact = router.isActiveRoute(
        "users.view",
        { id: "7" },
        current.search,
        true,
        false,
      );
      const hierarchical = router.isActiveRoute(
        "users",
        {},
        current.search,
        false,
        false,
      );

      expect(exact).toBe(hierarchical);
      expect(exact).toBe(true);
    });

    // CONTROL — the flag still does the job it is named for. Without this cell
    // the two above are satisfied by an exact arm that ignores the query
    // altogether, i.e. by deleting the feature rather than fixing it.
    it("still compares the query channel it is named for", async () => {
      await router.navigate("section.query", { section: "s" }, { param1: "x" });
      const current = router.getState()!;

      expect(
        router.isActiveRoute(
          "section.query",
          { section: "s" },
          current.search,
          true,
          false,
        ),
      ).toBe(true);
      expect(
        router.isActiveRoute(
          "section.query",
          { section: "s" },
          { param1: "y" },
          true,
          false,
        ),
      ).toBe(false);
    });

    // The two arms ask the SAME predicate, so a key the committed state
    // carries decides on both — including a `defaultParams` name that reaches
    // no URL, and including under the DEFAULT polarity, which is the one every
    // `<Link>` renders with.
    it("honours a defaultParams key on BOTH arms and BOTH polarities", async () => {
      const withDefault = createRouter([
        { name: "home", path: "/home" },
        {
          name: "p",
          path: "/p",
          defaultParams: { filter: "active" },
          children: [{ name: "v", path: "/v/:id" }],
        },
      ]);

      try {
        await withDefault.start("/home");
        await withDefault.navigate("p.v", { id: "1", filter: "inactive" });

        // the key reaches no URL at all…
        expect(withDefault.getState()!.path).toBe("/p/v/1");
        expect(withDefault.getState()!.params).toStrictEqual({
          id: "1",
          filter: "inactive",
        });

        for (const ignoreQP of [true, false]) {
          // EXACT arm
          expect(
            withDefault.isActiveRoute(
              "p.v",
              { id: "1", filter: "inactive" },
              undefined,
              true,
              ignoreQP,
            ),
          ).toBe(true);
          expect(
            withDefault.isActiveRoute(
              "p.v",
              { id: "1", filter: "active" },
              undefined,
              true,
              ignoreQP,
            ),
          ).toBe(false);
          // HIERARCHICAL arm — the same two answers
          expect(
            withDefault.isActiveRoute(
              "p",
              { filter: "inactive" },
              undefined,
              false,
              ignoreQP,
            ),
          ).toBe(true);
          expect(
            withDefault.isActiveRoute(
              "p",
              { filter: "active" },
              undefined,
              false,
              ignoreQP,
            ),
          ).toBe(false);
        }
      } finally {
        withDefault.dispose();
      }
    });

    // …and a default declared on the DESCENDANT reaches the ancestor link too,
    // because the predicate asks the committed STATE rather than a lookup keyed
    // by one route name.
    it("honours a defaultParams key declared on the descendant", async () => {
      const onChild = createRouter([
        { name: "home", path: "/home" },
        {
          name: "q",
          path: "/q",
          children: [{ name: "v", path: "/v/:id", defaultParams: { x: "1" } }],
        },
      ]);

      try {
        await onChild.start("/home");
        await onChild.navigate("q.v", { id: "1" });

        expect(
          onChild.isActiveRoute("q", { x: "1" }, undefined, false, false),
        ).toBe(true);
        expect(
          onChild.isActiveRoute("q", { x: "2" }, undefined, false, false),
        ).toBe(false);
      } finally {
        onChild.dispose();
      }
    });

    // A key no route put in the state decides nothing on EITHER arm — this is
    // the hierarchical half.
    it("ignores an undeclared link key on the hierarchical arm too", () => {
      const current = router.getState()!;

      expect(
        router.isActiveRoute(
          "users",
          { zz: "1" },
          current.search,
          false,
          false,
        ),
      ).toBe(router.isActiveRoute("users", {}, current.search, false, false));
      expect(
        router.isActiveRoute(
          "users",
          { zz: "1" },
          current.search,
          false,
          false,
        ),
      ).toBe(true);
    });

    // …and a key the config DOES declare still decides there, even when it
    // reaches no URL: a parent's `defaultParams` is a route-level parameter
    // surface, pinned by its own suite above.
    it("still honours a declared path param on the hierarchical arm", () => {
      const current = router.getState()!;

      expect(
        router.isActiveRoute(
          "users",
          { id: "7" },
          current.search,
          false,
          false,
        ),
      ).toBe(true);
      expect(
        router.isActiveRoute(
          "users",
          { id: "zzz" },
          current.search,
          false,
          false,
        ),
      ).toBe(false);
    });

    // CONTROL — a DECLARED path param still decides.
    it("still compares declared path params", () => {
      const current = router.getState()!;

      expect(
        router.isActiveRoute(
          "users.view",
          { id: "8" },
          current.search,
          true,
          false,
        ),
      ).toBe(false);
    });

    // BOUNDARY — a DECLARED query name spelled into the params bag is a
    // DIFFERENT key, and it is not inert. It prints nothing of its own, so
    // with no `defaultSearch` for that slot the href is unchanged and the
    // answer is `true` (pinned in `tests/functional/utils.test.ts`); but it
    // WITHHOLDS such a default, and there the href really loses
    // `?name=value`, so the location differs and the answer is `false`.
    // Same rule — compare the location — opposite outcome.
    it("honours a query default the params-bag twin withholds", async () => {
      const withDefault = createRouter([
        { name: "home", path: "/home" },
        { name: "s", path: "/s?param2", defaultSearch: { param2: "dflt" } },
      ]);

      try {
        await withDefault.start("/home");
        await withDefault.navigate("s", {});

        expect(withDefault.getState()!.path).toBe("/s?param2=dflt");
        // the twin withholds the default, so the href is a DIFFERENT location
        expect(withDefault.buildPath("s", { param2: "123" })).toBe("/s");
        expect(
          withDefault.isActiveRoute(
            "s",
            { param2: "123" },
            undefined,
            true,
            false,
          ),
        ).toBe(false);
        // …and the same link without it points at the committed location
        expect(withDefault.isActiveRoute("s", {}, undefined, true, false)).toBe(
          true,
        );
      } finally {
        withDefault.dispose();
      }
    });

    // BOUNDARY — the public `areStatesEqual` is NOT changed by this. Its
    // `false` polarity answers state identity and compares the whole bag; that
    // is what #515 / #478 pin, and what `canSkipPopstateHistoryWrite` asks for.
    it("leaves areStatesEqual's own contract alone", () => {
      const api = getPluginApi(router);
      const withKey = api.makeState("users.view", { id: "7", tab: "settings" });
      const without = api.makeState("users.view", { id: "7" });

      expect(router.areStatesEqual(withKey, without, false)).toBe(false);
      expect(router.areStatesEqual(withKey, without, true)).toBe(true);
    });
  });

  // The same absent-bag defect as `buildPath`, one layer of catch away: the
  // parameter default (`params: Params = EMPTY_PARAMS`) fires for `undefined`
  // only, so `null` travelled down to the same `normalizeChannel` throw — which
  // this predicate's render-path safety net then caught and reported as
  // "inactive". A link to the page the user is ON rendered as not-current
  // (#1822). Throwing here would be wrong too; answering wrongly is worse,
  // because nothing surfaces.
  describe("an absent params bag has two spellings (#1822)", () => {
    const ABSENT = null as unknown as Params;

    it("answers for null exactly as it answers for undefined", () => {
      expect(router.isActiveRoute("home", ABSENT)).toBe(
        router.isActiveRoute("home"),
      );
      expect(router.isActiveRoute("home", ABSENT)).toBe(true);
    });

    it("does not reach the render-path safety net", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      router.isActiveRoute("home", ABSENT);

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("CONTROL — a route that is not active still answers false", () => {
      expect(router.isActiveRoute("sign-in", ABSENT)).toBe(false);
    });
  });
});
