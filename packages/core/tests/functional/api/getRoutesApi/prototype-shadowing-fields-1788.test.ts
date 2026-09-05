import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Route, RouteConfigUpdate } from "@real-router/core/types";

/**
 * A plugin-defined custom field whose NAME shadows an `Object.prototype` member
 * must survive every door as a genuine OWN property, and must never become the
 * bag's prototype (#1788).
 *
 * One name in that set is not like the others: `__proto__` is the only ACCESSOR
 * on `Object.prototype`, so `bag[key] = value` dispatches into its setter
 * instead of creating an entry. `prepareCustomFields` merged patch keys with
 * exactly that plain assignment, so `update()` with a `"__proto__"` key
 * **swapped the prototype of the record it then stored** — and that record is
 * what `getPluginApi(router).getRouteConfig(name)` hands to plugins, which read
 * it BY KEY (`config?.[hookName]`, `config?.preload`, `config?.searchSchema`).
 * An injected function is therefore compiled and invoked as a lifecycle hook or
 * a preload factory. Measured before the fix, on a patch that came from JSON:
 *
 *     update("a", JSON.parse('{"__proto__":{"preload":"INJECTED"}}'))
 *       own keys  ["meta"]        ← the injection is invisible here
 *       .preload  "INJECTED"      ← inherited through the swapped prototype
 *
 * ⚑ Written as a TABLE over names × doors rather than as one cell, because the
 * defect belongs to the WRITE PRIMITIVE and not to one key: `constructor` /
 * `toString` are plain data properties on `Object.prototype` and were always
 * stored correctly, which is exactly what makes them the control — the fix must
 * keep them on the plain-assignment fast path instead of becoming a blanket
 * special case for "dangerous-looking names". That is the shape of both
 * precedents in this repo, `assignParam`
 * (`engine/search-params/searchParams.ts`) and `claim.write` (#1191): each
 * special-cases this ONE name and says why.
 *
 * ⚠ Fixtures use a COMPUTED key. In source, `{ __proto__: x }` sets the
 * prototype and creates no own entry, while `{ ["__proto__"]: x }` creates the
 * own entry and leaves the prototype alone (measured, both) — so a hand-written
 * literal cannot express the input this file is about.
 */
describe("a custom field named like an Object.prototype member (#1788)", () => {
  const SHADOWING = ["__proto__", "constructor", "toString"];

  /**
   * A pure DESCRIBER, not an assertion helper: the facts that together say "the
   * field landed as ordinary data" are compared in ONE `expect`, so a failure
   * shows which of them broke instead of stopping at the first.
   *
   * ⚑ The whole DESCRIPTOR, not just the value — and that is measured, not
   * decorative. The fix writes the field with `Object.defineProperty`, whose
   * three flags default to `false` when omitted; mutating them one at a time
   * against the full tier showed `writable: false` and `configurable: false`
   * leaving the whole suite green, i.e. two flags of the descriptor the fix
   * promises were unguarded. (`enumerable: false` was caught, but only
   * indirectly: it empties `Object.keys(record)`, so `commitRouteUpdate` drops
   * the whole record and `getRouteConfig` answers `undefined`.) Comparing the
   * descriptor pins the shape the two precedents also write, and it makes the
   * four doors say the same thing — plain assignment and `Object.fromEntries`
   * both produce `writable/enumerable/configurable: true`.
   */
  const describeField = (
    bag: Record<string, unknown> | undefined,
    key: string,
  ): Record<string, unknown> => ({
    // `hasOwn`, not `bag[key] !== undefined`: an inherited member reads as
    // defined and would satisfy a truthiness check while living on the
    // prototype — which is the whole defect.
    own: bag !== undefined && Object.hasOwn(bag, key),
    protoIntact: Object.getPrototypeOf(bag ?? {}) === Object.prototype,
    descriptor:
      bag === undefined ? undefined : Object.getOwnPropertyDescriptor(bag, key),
  });

  const routeWith = (key: string): Route => ({
    name: "a",
    path: "/a",
    meta: 1,
    [key]: { marker: key },
  });

  const patchWith = (key: string): RouteConfigUpdate => ({
    [key]: { marker: key },
  });

  /** The one shape every door must produce: an ordinary, enumerable data property. */
  const landed = (value: unknown): Record<string, unknown> => ({
    own: true,
    protoIntact: true,
    descriptor: { value, writable: true, enumerable: true, configurable: true },
  });

  describe.each(SHADOWING)("%s", (key) => {
    it("survives createRouter", () => {
      const router = createRouter([routeWith(key)]);

      expect(
        describeField(getPluginApi(router).getRouteConfig("a"), key),
      ).toStrictEqual(landed({ marker: key }));

      router.dispose();
    });

    it("survives add()", () => {
      const router = createRouter([{ name: "home", path: "/" }]);

      getRoutesApi(router).add(routeWith(key));

      expect(
        describeField(getPluginApi(router).getRouteConfig("a"), key),
      ).toStrictEqual(landed({ marker: key }));

      router.dispose();
    });

    it("survives replace()", () => {
      const router = createRouter([{ name: "home", path: "/" }]);

      getRoutesApi(router).replace([routeWith(key)]);

      expect(
        describeField(getPluginApi(router).getRouteConfig("a"), key),
      ).toStrictEqual(landed({ marker: key }));

      router.dispose();
    });

    it("survives update() on a route that already has a custom field", () => {
      const router = createRouter([{ name: "a", path: "/a", meta: 1 }]);

      getRoutesApi(router).update("a", patchWith(key));

      expect(
        describeField(getPluginApi(router).getRouteConfig("a"), key),
      ).toStrictEqual(landed({ marker: key }));

      router.dispose();
    });

    it("survives update() on a route with NO other custom field", () => {
      // Sharper than the cell above: before the fix the swapped record ended up
      // with ZERO own keys, so the caller dropped the whole entry and
      // `getRouteConfig` answered `undefined` — the injection was invisible in
      // BOTH directions at once.
      const router = createRouter([{ name: "a", path: "/a" }]);

      getRoutesApi(router).update("a", patchWith(key));

      expect(
        describeField(getPluginApi(router).getRouteConfig("a"), key),
      ).toStrictEqual(landed({ marker: key }));

      router.dispose();
    });

    it("takes a non-object value too, instead of dropping it silently", () => {
      // The second half of the same primitive: the inherited `__proto__` setter
      // IGNORES a non-object, so the field vanished with no diagnostic — while
      // `add()` stored the identical input faithfully. One write primitive, two
      // entry points, two answers.
      const router = createRouter([{ name: "a", path: "/a", meta: 1 }]);

      getRoutesApi(router).update(
        "a",
        JSON.parse(`{"${key}":"scalar"}`) as RouteConfigUpdate,
      );

      expect(
        describeField(getPluginApi(router).getRouteConfig("a"), key),
      ).toStrictEqual(landed("scalar"));

      router.dispose();
    });

    it("null still removes it, and only it", () => {
      const router = createRouter([routeWith(key)]);

      getRoutesApi(router).update(
        "a",
        JSON.parse(`{"${key}":null}`) as RouteConfigUpdate,
      );

      const bag = getPluginApi(router).getRouteConfig("a");

      // CONTROL — the sibling field is untouched, so removal is scoped rather
      // than the record being dropped or replaced wholesale.
      expect({
        removed: !Object.hasOwn(bag ?? {}, key),
        sibling: bag?.meta,
      }).toStrictEqual({ removed: true, sibling: 1 });

      router.dispose();
    });
  });

  it("CONTROL — the table is non-empty, and Object.prototype is never polluted", () => {
    // ⚑ Non-vacuity FIRST, and it lives here because this cell is the only one
    // OUTSIDE `describe.each`: the table above is generated from `SHADOWING`, and
    // `describe.each([])` registers ZERO cells in silence — measured, emptying
    // the list collapses the file to this single cell and it stays GREEN. A
    // count is what discriminates there, not a colour.
    expect(SHADOWING).toContain("__proto__");
    expect(SHADOWING.length).toBeGreaterThan(2);

    const router = createRouter([{ name: "a", path: "/a", meta: 1 }]);

    for (const key of SHADOWING) {
      getRoutesApi(router).update("a", patchWith(key));
    }

    expect({
      leaked: "marker" in {},
      protoIntact: Object.getPrototypeOf({}) === Object.prototype,
    }).toStrictEqual({ leaked: false, protoIntact: true });

    router.dispose();
  });
});
