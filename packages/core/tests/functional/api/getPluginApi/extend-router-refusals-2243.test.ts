import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";
import { NON_OBJECT_CONTAINERS } from "../../../helpers/hostileBags";

import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

describe("extendRouter — the shape of its argument", () => {
  let router: Router;
  let api: PluginApi;

  beforeEach(() => {
    router = createTestRouter();
    api = getPluginApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  // #2243. The criterion's first half — SILENT CORRUPTION — and the write it
  // refuses lands on the ROUTER ITSELF, not in an internal registry the way a
  // refused listener would: `Object.keys("ab")` is
  // `["0","1"]`, a router owns no numeric keys so the collision check passes, and
  // the loop assigns them onto the live instance.
  describe("refuses what it would otherwise write (#2243)", () => {
    const raw = (): { extendRouter: (extensions: unknown) => unknown } =>
      api as never;

    const keysOf = (r: Router): string[] =>
      Object.keys(r as unknown as Record<string, unknown>);

    it("refuses every non-object container", () => {
      expect(NON_OBJECT_CONTAINERS).toHaveLength(6);

      for (const [label, value] of NON_OBJECT_CONTAINERS) {
        expect(
          () => raw().extendRouter(value),
          `${label} must be refused`,
        ).toThrow(TypeError);
      }
    });

    it("names the door, so the caller is not left with a bare intrinsic", () => {
      expect(() => raw().extendRouter("ab")).toThrow(
        /\[router\.extendRouter\].*plain object/,
      );
    });

    // The row that made this a `high`: without the guard these two land as
    // `router["0"] === "a"` and `router["1"] === "b"`.
    it("leaves no index behind after refusing a string", () => {
      const before = keysOf(router);

      expect(() => raw().extendRouter("ab")).toThrow(TypeError);

      expect(
        (router as unknown as Record<string, unknown>)["0"],
      ).toBeUndefined();
      expect(keysOf(router)).toStrictEqual(before);
    });

    // An array is the same defect wearing an object's `typeof`: its own
    // enumerable keys are indices too, so a `typeof`-only gate would admit it.
    it("refuses an array, and says why rather than answering its typeof", () => {
      expect(() => raw().extendRouter(["a", "b"])).toThrow(
        /got a non-plain object/,
      );
      expect(
        (router as unknown as Record<string, unknown>)["0"],
      ).toBeUndefined();
    });

    it("refuses a class instance", () => {
      class Extensions {
        greet = (): string => "hi";
      }

      expect(() => raw().extendRouter(new Extensions())).toThrow(
        /got a non-plain object/,
      );
    });

    it("renders null as null rather than as its typeof", () => {
      expect(() => raw().extendRouter(null)).toThrow(/got null/);
    });

    // Mutation found this arm unpinned: a `shapeOf` that answered
    // "a non-plain object" for EVERYTHING left the suite green.
    it("renders a primitive by its typeof, not as an object", () => {
      expect(() => raw().extendRouter("ab")).toThrow(/got string/);
      expect(() => raw().extendRouter(7)).toThrow(/got number/);
    });

    // ⚑ The `typeof` term in the predicate reads as redundant — every primitive's
    // prototype already fails the constructor check — and mutation proved it is
    // not: with the term removed the suite stayed green, because no ordinary
    // primitive reaches the second half with `Object` as its constructor. Forge
    // one and it does, and the string's indices land on the router again.
    it("refuses a string even when String.prototype.constructor is forged", () => {
      const original = String.prototype.constructor;

      try {
        Object.defineProperty(String.prototype, "constructor", {
          value: Object,
          writable: true,
          configurable: true,
        });

        expect(() => raw().extendRouter("ab")).toThrow(TypeError);
        expect(
          (router as unknown as Record<string, unknown>)["0"],
        ).toBeUndefined();
      } finally {
        Object.defineProperty(String.prototype, "constructor", {
          value: original,
          writable: true,
          configurable: true,
        });
      }
    });

    // CONTROL — without these the assertions above are satisfied by a door that
    // refuses everything.
    it("CONTROL — a plain object still extends, and unsubscribes", () => {
      const remove = raw().extendRouter({ myExt: 1 }) as () => void;

      expect((router as unknown as Record<string, unknown>).myExt).toBe(1);
      expect(typeof remove).toBe("function");

      remove();

      expect(
        (router as unknown as Record<string, unknown>).myExt,
      ).toBeUndefined();
    });

    // CONTROL — a null-prototype bag is a plain bag. The dependency door admits
    // it deliberately (#1858) and this one answers the same, so the predicate is
    // shared rather than merely similar.
    it("CONTROL — a null-prototype bag still extends", () => {
      const bag = Object.create(null) as Record<string, unknown>;

      bag.bare = 2;

      const remove = raw().extendRouter(bag) as () => void;

      expect((router as unknown as Record<string, unknown>).bare).toBe(2);

      remove();
    });
  });
});
