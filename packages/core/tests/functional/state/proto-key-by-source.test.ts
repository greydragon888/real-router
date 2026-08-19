import { describe, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { installSpyValidator } from "../../helpers/spyValidator";

import type { Router, SearchParams, Params } from "@real-router/core";

/**
 * `__proto__` is answered by the SOURCE of the data, not by the name (#1792).
 *
 * `__proto__` is the one ACCESSOR among `Object.prototype`'s twelve own
 * members, so `bag[key] = value` for it dispatches into the inherited setter
 * and creates no own key. Every layer that met that fact answered it
 * separately, and the repository ended up with four policies for one key.
 * There is one rule now, and it keys on WHERE the data came from:
 *
 * - **the caller's per-navigation bag** — a programmer error, so core REFUSES
 *   it synchronously, at the same three producers the channel guard (#1572)
 *   refuses a mis-channelled key. The caller wrote the name; telling them is
 *   strictly better than any silent handling;
 * - **the wire** — a URL is not written by the caller, and `match()` MUST NOT
 *   throw on input (#737): a link from anywhere would otherwise crash a
 *   popstate handler. So the key is DROPPED, and `@real-router/validation-plugin`
 *   reports it — the same always-on-fixes / opt-in-diagnoses split the mode
 *   gate uses (#1575);
 * - **the developer's static config** — a route's custom field (#1788) and a
 *   plugin's context namespace (#1191) are names their author typed
 *   deliberately, with no outside payload involved. Those are untouched.
 *
 * ⚠ `JSON.parse`, never a literal: `{ __proto__: v }` in source sets the
 * PROTOTYPE and creates no own key, so a literal cannot express this input.
 */
describe("__proto__ is answered by the source of the data (#1792)", () => {
  let router: Router;

  afterEach(() => {
    router.dispose();
  });

  const mk = (): Router =>
    createRouter([
      { name: "h", path: "/h" },
      { name: "q", path: "/q?__proto__&a" },
      { name: "p", path: "/p/:__proto__" },
    ]);

  describe("the caller's bag — REFUSED, synchronously", () => {
    it("navigate refuses an own __proto__ in the query bag", async () => {
      router = mk();
      await router.start("/h");

      expect(() =>
        router.navigate(
          "q",
          {},
          JSON.parse('{"a":"1","__proto__":"V"}') as SearchParams,
        ),
      ).toThrow(/__proto__/);
    });

    it("navigate refuses it in the path bag", async () => {
      router = mk();
      await router.start("/h");

      expect(() =>
        router.navigate("p", JSON.parse('{"__proto__":"V"}') as Params),
      ).toThrow(/__proto__/);
    });

    it("makeState and buildNavigationState refuse it too", async () => {
      router = mk();
      await router.start("/h");

      const api = getPluginApi(router);
      const bag = JSON.parse('{"a":"1","__proto__":"V"}') as SearchParams;

      expect(() => api.makeState("q", {}, bag)).toThrow(/__proto__/);
      expect(() => api.buildNavigationState("q", {}, bag)).toThrow(/__proto__/);
    });

    it("CONTROL — an ordinary key on the same doors is untouched", async () => {
      router = mk();
      await router.start("/h");

      const state = await router.navigate("q", {}, { a: "1" });

      expect(state.path).toBe("/q?a=1");
    });
  });

  describe("the wire — DROPPED, and reported to the opt-in validator", () => {
    it("matchPath drops the key instead of throwing", async () => {
      router = mk();
      await router.start("/h");

      const matched = getPluginApi(router).matchPath("/q?a=1&__proto__=V");

      expect(matched).toBeDefined();
      expect(Object.getOwnPropertyNames(matched!.search)).toStrictEqual(["a"]);
    });

    it("reports the drop through the validator, with the route and the key", async () => {
      router = mk();

      const validator = installSpyValidator(router);

      await router.start("/h");
      getPluginApi(router).matchPath("/q?a=1&__proto__=V");

      expect(validator.state.reportUnsafeKeyDropped).toHaveBeenCalledWith(
        "q",
        "__proto__",
      );
    });

    it("CONTROL — bare core is silent, and never throws on a URL", async () => {
      router = mk();
      await router.start("/h");

      expect(() =>
        getPluginApi(router).matchPath("/q?a=1&__proto__=V"),
      ).not.toThrow();
    });
  });
});
