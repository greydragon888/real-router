import { describe, beforeEach, afterEach, it, expect } from "vitest";

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
        // `navigate` builds through the pipeline, so `makeState` is a separate
        // terminal — the one plugins use to rebuild a state from a serialized
        // history entry. Bare core (no validation-plugin) drops without a word.
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

      // `navigate` builds its state through the pipeline (`canonicalize`), so
      // `makeState`'s own gate is a SEPARATE terminal: plugins reconstructing a
      // state from a serialized history entry come through here, and it must
      // apply — and report — the same rule.
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
  });
});
