// Direct contract tests for `createRouteContext` from `src/createRouteContext.svelte.ts`.
//
// The function builds a `RouteContext` (`{ navigator, route, previousRoute }`)
// from a reactive `{ current: { route, previousRoute } }` source. Returned
// `route` / `previousRoute` are getter objects whose `.current` reads delegate
// to the reactive source per-call.
//
// Closes review §5.10 gaps:
//   - row 3 (LOW): identity stability — single object allocated per call;
//                  `.current` reads return live values (no snapshot copy)
//   - row 5 (LOW): previousRoute.current === undefined on initial reactive
//                  source (router not yet navigated twice)

import { describe, expect, it } from "vitest";

import { createRouteContext } from "../../src/createRouteContext.svelte";

import type { RouteSnapshot } from "../../src/createRouteContext.svelte";
import type { Navigator, Params, State } from "@real-router/core";

function makeReactive(initial: RouteSnapshot): {
  current: RouteSnapshot;
  setCurrent: (next: RouteSnapshot) => void;
} {
  let snapshot = initial;

  return {
    get current() {
      return snapshot;
    },
    setCurrent(next) {
      snapshot = next;
    },
  };
}

function makeState(name: string, params: Params = {}): State {
  return { name, params } as unknown as State;
}

describe("createRouteContext", () => {
  // Closes §5.10 row 3 (stable identity): the function MUST allocate the
  // `route` and `previousRoute` getter objects ONCE per call and reuse them
  // — described in CLAUDE.md "Performance" but never pinned by a test.
  // A naïve refactor that returns a fresh `{ get current() { ... } }` on
  // every property access would break Svelte 5 fine-grained reactivity:
  // consumers binding `route` to a `$derived` or destructuring it would see
  // ref-instability and re-run dependent effects on every navigation.
  describe("Stable identity contract", () => {
    it("repeated calls to `.route` and `.previousRoute` return the SAME getter object", () => {
      const reactive = makeReactive({
        route: undefined,
        previousRoute: undefined,
      });
      const navigator = {} as Navigator;
      const ctx = createRouteContext(navigator, reactive);

      const r1 = ctx.route;
      const r2 = ctx.route;
      const p1 = ctx.previousRoute;
      const p2 = ctx.previousRoute;

      // Same reference across reads — no per-access allocation.
      expect(r1).toBe(r2);
      expect(p1).toBe(p2);
      // Distinct objects (route vs previousRoute) at the top level.
      expect(r1).not.toBe(p1);
    });

    it("identity stable across reactive source mutations", () => {
      const reactive = makeReactive({
        route: undefined,
        previousRoute: undefined,
      });
      const navigator = {} as Navigator;
      const ctx = createRouteContext(navigator, reactive);

      const initialRoute = ctx.route;
      const initialPrev = ctx.previousRoute;

      reactive.setCurrent({
        route: makeState("home"),
        previousRoute: undefined,
      });

      // Even after the underlying snapshot changed, the GETTER OBJECTS are
      // identical to their initial refs — only `.current` returns the new
      // value. This is the contract that lets consumers cache `{ route }` and
      // observe future updates through `route.current`.
      expect(ctx.route).toBe(initialRoute);
      expect(ctx.previousRoute).toBe(initialPrev);

      // And the .current values DO reflect the new snapshot.
      expect(ctx.route.current?.name).toBe("home");
      expect(ctx.previousRoute.current).toBeUndefined();
    });

    it("navigator passed through verbatim (by reference)", () => {
      const reactive = makeReactive({
        route: undefined,
        previousRoute: undefined,
      });
      const navigator = { navigate: () => undefined } as unknown as Navigator;
      const ctx = createRouteContext(navigator, reactive);

      expect(ctx.navigator).toBe(navigator);
    });
  });

  // Closes §5.10 rows 1, 2, 4, 5: route.current / previousRoute.current
  // delegate to the reactive source per-call.
  describe(".current delegation to reactive source", () => {
    it("route.current === undefined when source.route === undefined", () => {
      const reactive = makeReactive({
        route: undefined,
        previousRoute: undefined,
      });
      const ctx = createRouteContext({} as Navigator, reactive);

      expect(ctx.route.current).toBeUndefined();
    });

    it("route.current reflects source.route after mutation", () => {
      const reactive = makeReactive({
        route: undefined,
        previousRoute: undefined,
      });
      const ctx = createRouteContext({} as Navigator, reactive);

      reactive.setCurrent({
        route: makeState("users.list"),
        previousRoute: undefined,
      });

      expect(ctx.route.current?.name).toBe("users.list");
    });

    // Closes §5.10 row 5: previousRoute is undefined on the first navigation
    // (no prior state). Locking this so a refactor that defaulted previousRoute
    // to the same as route (or to a sentinel) would surface here.
    it("previousRoute.current === undefined on initial reactive state (single navigation)", () => {
      const reactive = makeReactive({
        route: makeState("home"),
        previousRoute: undefined,
      });
      const ctx = createRouteContext({} as Navigator, reactive);

      expect(ctx.route.current?.name).toBe("home");
      expect(ctx.previousRoute.current).toBeUndefined();
    });

    it("previousRoute.current reflects source.previousRoute after second navigation", () => {
      const reactive = makeReactive({
        route: makeState("home"),
        previousRoute: undefined,
      });
      const ctx = createRouteContext({} as Navigator, reactive);

      reactive.setCurrent({
        route: makeState("about"),
        previousRoute: makeState("home"),
      });

      expect(ctx.route.current?.name).toBe("about");
      expect(ctx.previousRoute.current?.name).toBe("home");
    });
  });
});
