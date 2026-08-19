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
 * - **the wire, QUERY channel** — a URL is not written by the caller, and
 *   `match()` MUST NOT throw on input (#737): a link from anywhere would
 *   otherwise crash a popstate handler. So the key is DROPPED, and
 *   `@real-router/validation-plugin` reports it — the same always-on-fixes /
 *   opt-in-diagnoses split the mode gate uses (#1575). The wire's PATH channel
 *   is deliberately NOT checked: `normalizeParams` plain-assigns, so the key is
 *   already gone there whatever we do, and checking bought visibility of that
 *   loss at a measured price on every navigation;
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

    it("is undefined-BLIND — the removal marker is not a caller insisting", async () => {
      // ⚑ `undefined` means "I said nothing" everywhere in this router
      // (INVARIANTS makeState #5), so `{ __proto__: undefined }` is the removal
      // marker, not a caller demanding the name. The channel guard beside this
      // one is blind to it for the identical reason, and refusing here would
      // make the ABSENCE of a value louder than the value.
      //
      // ⚠ Not a hole: the key still reaches `canonicalize` and is stripped — but
      // NOT reported, because nothing was carried, and the diagnostic is worded
      // for the wire. A message blaming a URL for the caller's own bag is worse
      // than silence. Found by sweeping every value form through the door.
      router = mk();
      await router.start("/h");

      const bag = JSON.parse('{"a":"1"}') as Record<string, unknown>;

      Object.defineProperty(bag, "__proto__", {
        value: undefined,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      const validator = installSpyValidator(router);
      const state = await router.navigate("q", {}, bag as SearchParams);

      expect(state.path).toBe("/q?a=1");
      expect(Object.getOwnPropertyNames(state.search)).toStrictEqual(["a"]);

      // ⚑ And SILENT. Without this the gate on the report is unguarded —
      // measured: forcing it open left all 4312 tests green, because the two
      // assertions above cannot see a diagnostic. The message is worded for the
      // wire, and this is the one path on which a caller's bag reaches it.
      expect(validator.state.reportUnsafeKeyDropped).not.toHaveBeenCalled();
    });

    it("CONTROL — the other eleven inherited names still travel", async () => {
      // ⚑ The refusal is about ONE name, not about `Object.prototype`. The other
      // eleven own members are plain DATA properties, so an own key of those
      // names shadows correctly and must pass through like any other. Without
      // this cell "refuse the whole prototype" would satisfy every assertion
      // above.
      const others = Object.getOwnPropertyNames(Object.prototype).filter(
        (name) => name !== "__proto__",
      );

      expect(others).toHaveLength(11);

      for (const name of others) {
        const local = createRouter([
          { name: "h", path: "/h" },
          { name: "n", path: `/n?${name}` },
        ]);

        await local.start("/h");

        const state = await local.navigate(
          "n",
          {},
          JSON.parse(`{${JSON.stringify(name)}:"V"}`) as SearchParams,
        );

        expect(state.path).toBe(`/n?${name}=V`);

        local.dispose();
      }
    });

    it("CONTROL — an ordinary key on the same doors is untouched", async () => {
      router = mk();
      await router.start("/h");

      const state = await router.navigate("q", {}, { a: "1" });

      expect(state.path).toBe("/q?a=1");
    });
  });

  describe("a route's own defaults — REFUSED at registration", () => {
    // ⚑ The third source category, and the one the first draft missed. A default
    // is typed by the developer, so it LOOKS like the static-config case #1788
    // and #1191 preserve — but unlike a custom field it does not stay in the
    // config: it flows into the very channel a caller's bag is refused from.
    // Measured before this existed: the default was silently lost in the merge,
    // even with nothing filled, so the developer got neither the key nor a word.
    //
    // ⚠ At REGISTRATION, not at navigation: both sides are known at
    // `createRouter` / `add` / `replace` / `update` / `setRootPath`, so the error
    // names the route and the slot rather than surfacing later about a bag the
    // user never passed. Same reasoning `assertRouteDefaultChannels` records.
    it("refuses a defaultSearch entry named __proto__", () => {
      expect(() =>
        createRouter([
          { name: "h", path: "/h" },
          {
            name: "a",
            path: "/a?lang&__proto__",
            defaultSearch: JSON.parse(
              '{"lang":"en","__proto__":"FROM-CONFIG"}',
            ) as SearchParams,
          },
        ]),
      ).toThrow(/__proto__/);
    });

    it("refuses a defaultParams entry named __proto__", () => {
      expect(() =>
        createRouter([
          { name: "h", path: "/h" },
          {
            name: "p",
            path: "/p/:__proto__",
            defaultParams: JSON.parse('{"__proto__":"FROM-CONFIG"}') as Params,
          },
        ]),
      ).toThrow(/__proto__/);
    });

    it("CONTROL — ordinary defaults on the same slots register fine", async () => {
      router = createRouter([
        { name: "h", path: "/h" },
        { name: "a", path: "/a?lang", defaultSearch: { lang: "en" } },
        { name: "p", path: "/p/:id", defaultParams: { id: "7" } },
      ]);

      await router.start("/h");

      expect(router.buildPath("a", {})).toBe("/a?lang=en");
      expect(router.buildPath("p", {})).toBe("/p/7");
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

    it("leaves the PATH channel silent — the key is gone either way", async () => {
      // ⚑ This pins a DELIBERATE silence, so it is written to fail if the
      // silence ever becomes vacuous.
      //
      // A path `__proto__` cannot reach `state.params` in any case:
      // `normalizeParams` plain-assigns, and assignment to that name hits the
      // inherited setter and creates no own key. An earlier draft made the loss
      // VISIBLE — the matcher stopped losing the key (six decode/merge writes
      // converted to defines) so `canonicalize` had something left to report.
      // That bought visibility and nothing else, and it charged for it: the
      // change measured about +7 % on `navigate`, paired within rounds and
      // positive in 14 of 14, of which neutralising the two membership tests
      // recovered 4.6 pp. Owner's call — keep the correctness half (the query
      // channel, where the key CAN survive into `state.search`), drop the
      // diagnostic half.
      //
      // ⚠ The second half of this test is what makes the first half mean
      // anything: the same router and the same spy DO report a query drop. A
      // validator that was never wired would satisfy `not.toHaveBeenCalled()`
      // just as well.
      //
      // ⚑ What each half actually catches, mutated rather than argued:
      // - BOTH sites restored (matcher defines + `canonicalize` strips the path
      //   bag) → this cell fails. That is the regression worth guarding, and it
      //   takes two sites, so a single-site mutation proves nothing here;
      // - the path strip restored ALONE → nothing fails, and correctly so: the
      //   matcher loses the key before `canonicalize` can see it, which makes
      //   the strip dead code on its own;
      // - the matcher's defines restored ALONE → nothing fails HERE either,
      //   because `normalizeParams` copies by plain assignment into a fresh bag
      //   and drops the own key a second time. That mutation is a cost without
      //   an effect — an engine-tier concern, not a state-contract one.
      router = createRouter([
        { name: "h", path: "/h" },
        { name: "q", path: "/q?__proto__&a" },
        { name: "p", path: "/p/:__proto__" },
        // The junction shape: a param child beside a splat sibling reaches the
        // merge, not the direct write.
        { name: "j", path: "/j/:__proto__/x" },
        { name: "s", path: "/j/*rest" },
      ]);

      const validator = installSpyValidator(router);

      await router.start("/h");

      const api = getPluginApi(router);

      // The key never lands in `params`, exactly as before — nothing regressed
      // about the RESULT, only about whether anyone is told.
      expect(
        Object.getOwnPropertyNames(api.matchPath("/p/V")!.params),
      ).toStrictEqual([]);
      expect(
        Object.getOwnPropertyNames(api.matchPath("/j/V/x")!.params),
      ).toStrictEqual([]);

      expect(validator.state.reportUnsafeKeyDropped).not.toHaveBeenCalled();

      // …and the gate is open, on the channel that owns it.
      api.matchPath("/q?a=1&__proto__=V");

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
