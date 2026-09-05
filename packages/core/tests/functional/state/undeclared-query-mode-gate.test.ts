import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { installSpyValidator } from "../../helpers/spyValidator";

import type { QueryParamsMode, Router } from "@real-router/core";

/**
 * The mode gate (#1575), phase 0b-4.
 *
 * One rule for all three modes: **a key the active `queryParamsMode` does not
 * PRINT does not enter the canonical query channel — from either direction.**
 *
 * It buys one invariant: `keys(state.search) ⊆ keys(matchPath(state.path).search)`
 * in every mode. Before the gate, `default` and `strict` published states whose
 * own `path` contradicted their own `search` — the URL build has always printed
 * declared names only, while both the parse side and the intent side kept the
 * undeclared key in `state.search`.
 *
 * It is a DROP, not a move: the key does not fall back into `state.params`.
 * Re-channelling it there is what would keep #1553's ambiguity alive.
 */
const ROUTES = [
  { name: "h", path: "/h" },
  { name: "plain", path: "/plain" },
  { name: "dec", path: "/dec?a" },
  // `defaultSearch` for a key the route does NOT declare with `?` — dead config
  // under default/strict, the side edge the RFC asked to name explicitly.
  { name: "dead", path: "/dead", defaultSearch: { und: "U" } },
];

function mk(mode: QueryParamsMode): Router {
  return createRouter(ROUTES, { queryParamsMode: mode });
}

let router: Router;

describe("undeclared query key — the queryParamsMode gate (#1575)", () => {
  afterEach(() => {
    router.stop();
  });

  describe("loose — undeclared is printed, so it is admitted", () => {
    beforeEach(() => {
      router = mk("loose");
    });

    it("keeps an undeclared key on the intent direction and prints it", async () => {
      await router.start("/h");

      const state = await router.navigate("plain", {}, { foo: "1" });

      expect(state.search).toStrictEqual({ foo: "1" });
      expect(state.path).toBe("/plain?foo=1");
    });

    it("keeps an undeclared key on the URL direction", () => {
      expect(
        getPluginApi(router).matchPath("/plain?foo=1")?.search,
      ).toStrictEqual({ foo: 1 });
    });

    it("keeps a defaultSearch declared for an undeclared key", async () => {
      await router.start("/h");

      const state = await router.navigate("dead");

      expect(state.search).toStrictEqual({ und: "U" });
      expect(state.path).toBe("/dead?und=U");
    });
  });

  describe.each(["default", "strict"] as const)(
    "%s — undeclared is not printed, so it is dropped",
    (mode) => {
      beforeEach(() => {
        router = mk(mode);
      });

      it("drops an undeclared key from state.search on the intent direction", async () => {
        await router.start("/h");

        const state = await router.navigate("plain", {}, { foo: "1" });

        expect(state.search).toStrictEqual({});
        expect(state.path).toBe("/plain");
      });

      it("keeps the declared half of a mixed bag and drops the rest", async () => {
        await router.start("/h");

        const state = await router.navigate("dec", {}, { a: "1", foo: "2" });

        // The declared key is the control: a gate that dropped everything would
        // pass the assertion above and fail here.
        expect(state.search).toStrictEqual({ a: "1" });
        expect(state.path).toBe("/dec?a=1");
      });

      it("does NOT re-channel the dropped key into state.params", async () => {
        await router.start("/h");

        const state = await router.navigate("plain", {}, { foo: "1" });

        // A drop, not a move — putting it in the path bag would re-create the
        // per-entry-point channel ambiguity this step exists to remove (#1553).
        expect(state.params).toStrictEqual({});
      });

      it("drops from a DIRECT makeState too, silently in bare core", () => {
        // `makeState` is the same pipeline in its literal form (Phase 4), but a
        // distinct ENTRY — the one plugins use to rebuild a state from a
        // serialized history entry. Bare core (no validation-plugin) drops
        // without a word.
        const state = getPluginApi(router).makeState("plain", {}, { foo: "1" });

        expect(state.search).toStrictEqual({});
        expect(state.path).toBe("/plain");
      });

      it("makes a defaultSearch for an undeclared key dead config", async () => {
        await router.start("/h");

        const state = await router.navigate("dead");

        expect(state.search).toStrictEqual({});
        expect(state.path).toBe("/dead");
      });
    },
  );

  describe("default — the URL direction still MATCHES, it just does not keep the key", () => {
    beforeEach(() => {
      router = mk("default");
    });

    it("matches a URL carrying an undeclared key but drops it from state", () => {
      const state = getPluginApi(router).matchPath("/plain?foo=1");

      // Accepting the URL is what distinguishes `default` from `strict`; the
      // gate changes what becomes STATE, never what matches.
      expect(state?.name).toBe("plain");
      expect(state?.search).toStrictEqual({});
      expect(state?.path).toBe("/plain");
    });

    it("keeps the declared half of a mixed URL", () => {
      const state = getPluginApi(router).matchPath("/dec?a=1&foo=2");

      expect(state?.search).toStrictEqual({ a: 1 });
      expect(state?.path).toBe("/dec?a=1");
    });
  });

  describe("strict — the parse side still rejects such a URL", () => {
    beforeEach(() => {
      router = mk("strict");
    });

    it("leaves the matcher's rejection untouched", () => {
      expect(getPluginApi(router).matchPath("/plain?foo=1")).toBeUndefined();
    });
  });

  describe("the invariant the gate buys", () => {
    it.each(["loose", "default"] as const)(
      "keys(state.search) ⊆ keys(matchPath(state.path).search) — %s",
      async (mode) => {
        router = mk(mode);
        await router.start("/h");

        const state = await router.navigate("dec", {}, { a: "1", foo: "2" });
        const reparsed = getPluginApi(router).matchPath(state.path);

        expect(reparsed).toBeDefined();
        expect(
          Object.keys(state.search).every((k) => k in reparsed!.search),
        ).toBe(true);
      },
    );
  });

  describe("the opt-in diagnostic — core's call-site contract", () => {
    // Bare core drops SILENTLY; making the drop visible is `validation-plugin`'s
    // job. Core's own responsibility is only to CALL the hook, with the resolved
    // route name and the dropped key — asserted here against a spy validator so
    // the contract is covered without depending on the plugin package.
    it("reports each dropped key on the intent direction", async () => {
      router = mk("default");

      const validator = installSpyValidator(router);

      await router.start("/h");
      await router.navigate("plain", {}, { foo: "1", bar: "2" });

      expect(validator.state.reportDroppedQueryKey).toHaveBeenCalledWith(
        "plain",
        "foo",
      );
      expect(validator.state.reportDroppedQueryKey).toHaveBeenCalledWith(
        "plain",
        "bar",
      );
    });

    it("reports nothing when the ROUTE does not exist (#1584)", async () => {
      // The gate's DROP is always-on and unaffected — the navigation fails on
      // its own with ROUTE_NOT_FOUND either way. What was wrong is the REPORT:
      // the declaration registry answers `[]` for a route with no declarations
      // AND for a route with no existence, so every query key was announced as
      // "not declared on route X" for a route X that is not a route. That
      // blames the query for a typo in the ROUTE name.
      //
      // Same precondition as the params-bag diagnostic's (#1579), found by
      // sweeping this file's sibling rather than named in the issue.
      router = mk("default");

      const validator = installSpyValidator(router);

      await router.start("/h");

      await expect(
        router.navigate("plainn", {}, { foo: "1" }),
      ).rejects.toMatchObject({ code: "ROUTE_NOT_FOUND" });

      expect(validator.state.reportDroppedQueryKey).not.toHaveBeenCalled();

      // Discrimination: the same key on a route that DOES exist still reports.
      await router.navigate("plain", {}, { foo: "1" });

      expect(validator.state.reportDroppedQueryKey).toHaveBeenCalledWith(
        "plain",
        "foo",
      );
    });

    it("reports nothing from the makeState terminal either (#1584)", () => {
      // The gate HAD two terminals, and #1584 landed on one. It was found by
      // sweeping `pipeline/canonicalize`'s PORT consumers — a sweep that could
      // not see the other, which read its own dependency bag. Phase 4 folded
      // `makeState` onto `canonicalize`, so there is one implementation now and
      // this case is guarded by it; the test stays because the ENTRY is still
      // distinct. `makeState` with an explicit `path` is precisely the shape a
      // URL plugin uses to rebuild a state from a serialized history entry,
      // where the route name may be gone or not yet registered, so it does not
      // even fail on its own the way the navigate arm does.
      //
      // The second-order cost is what makes it worth a test rather than a
      // comment: the de-dup cache is shared by both terminals, so a bogus report
      // from here burns the slot and silences the GENUINE warning at the
      // terminal that WAS gated, once the name becomes real.
      router = mk("default");

      const validator = installSpyValidator(router);
      const api = getPluginApi(router);

      api.makeState("plainn", {}, { foo: "1" }, "/plainn");

      expect(validator.state.reportDroppedQueryKey).not.toHaveBeenCalled();

      // The DROP itself is unaffected — always-on and correct for any name.
      expect(
        api.makeState("plainn", {}, { foo: "1" }, "/plainn").search,
      ).toStrictEqual({});

      // Discrimination: a route that DOES exist still reports from here.
      api.makeState("plain", {}, { foo: "1" }, "/plain");

      expect(validator.state.reportDroppedQueryKey).toHaveBeenCalledWith(
        "plain",
        "foo",
      );
    });

    it("reports on the URL direction too", () => {
      router = mk("default");

      const validator = installSpyValidator(router);

      getPluginApi(router).matchPath("/plain?foo=1");

      expect(validator.state.reportDroppedQueryKey).toHaveBeenCalledWith(
        "plain",
        "foo",
      );
    });

    it("reports from a DIRECT makeState — the producer navigate does not use", () => {
      router = mk("default");

      const validator = installSpyValidator(router);

      // `makeState` is the literal form of the same pipeline since Phase 4, so
      // this is no longer a second terminal — but it IS a second ENTRY, the one
      // plugins reconstructing a state from a serialized history entry come
      // through, and the rule must reach it identically.
      const state = getPluginApi(router).makeState("plain", {}, { foo: "1" });

      expect(state.search).toStrictEqual({});
      expect(validator.state.reportDroppedQueryKey).toHaveBeenCalledWith(
        "plain",
        "foo",
      );
    });

    it("stays silent when nothing is dropped", async () => {
      router = mk("default");

      const validator = installSpyValidator(router);

      await router.start("/h");
      await router.navigate("dec", {}, { a: "1" });

      expect(validator.state.reportDroppedQueryKey).not.toHaveBeenCalled();
    });

    /**
     * Every producer reports — the predicates included (#1581).
     *
     * The tests above pin `navigate`, `matchPath` and `makeState`, which is
     * exactly the set Phase 2 did NOT change. The producers it DID change —
     * `buildPath` and `isActiveRoute`'s descendant arm, which had no gate at all
     * before and so could not report — were pinned by nothing, so a refactor
     * could silence them again and this file would stay green. That is the
     * "one producer out of step" shape the phase exists to remove, and it is
     * uniformity, not an accident: measured on `ac0ffc0e3`, `canNavigateTo` and
     * `isActiveRoute`'s exact arm ALREADY reported (through `makeState`), so the
     * render path was never actually silent.
     *
     * Asserted as one list rather than eight cases so a failure names every
     * producer that went quiet, not just the first.
     */
    it("feeds the gate from EVERY producer, predicates included (#1581)", async () => {
      const routes = [
        { name: "h", path: "/h" },
        { name: "x", path: "/x?a", children: [{ name: "kid", path: "/kid" }] },
      ];
      const search = { a: "1", zz: "9" };

      async function reports(
        startPath: string,
        run: (r: Router) => unknown,
      ): Promise<boolean> {
        router.stop();
        router = createRouter(routes, { queryParamsMode: "default" });

        const spy = vi.mocked(
          installSpyValidator(router).state.reportDroppedQueryKey,
        );

        await router.start(startPath);
        spy.mockClear();
        await run(router);

        return spy.mock.calls.length > 0;
      }

      // `x` is active → the exact arm; `x.kid` is active → the descendant arm.
      // Both reach the gate through the same `canonicalize` call, but only the
      // first one did before the phase, so both are worth naming.
      const producers: [string, string, (r: Router) => unknown][] = [
        ["buildPath", "/h", (r) => r.buildPath("x", {}, search)],
        ["canNavigateTo", "/h", (r) => r.canNavigateTo("x", {}, search)],
        [
          "isActiveRoute (exact)",
          "/x?a=1",
          (r) => r.isActiveRoute("x", {}, search, false, false),
        ],
        [
          "isActiveRoute (descendant)",
          "/x/kid?a=1",
          (r) => r.isActiveRoute("x", {}, search, false, false),
        ],
        ["navigate", "/h", (r) => r.navigate("x", {}, search)],
        [
          "buildNavigationState",
          "/h",
          (r) => getPluginApi(r).buildNavigationState("x", {}, search),
        ],
        ["makeState", "/h", (r) => getPluginApi(r).makeState("x", {}, search)],
        ["matchPath", "/h", (r) => getPluginApi(r).matchPath("/x?a=1&zz=9")],
      ];

      const silent: string[] = [];

      for (const [label, startPath, run] of producers) {
        if (!(await reports(startPath, run))) {
          silent.push(label);
        }
      }

      expect(silent).toStrictEqual([]);
    });
  });
});
