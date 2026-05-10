import { describe, expect, it } from "vitest";

import { defer, isDeferred } from "../../src";
import { DEFER_BRAND } from "../../src/shared-ssr";

describe("defer()", () => {
  describe("happy path", () => {
    it("returns a payload with critical, deferred, and brand", () => {
      const promise = Promise.resolve(42);
      const payload = defer({
        critical: { name: "Alice" },
        deferred: { score: promise },
      });

      expect(payload.critical).toStrictEqual({ name: "Alice" });
      expect(payload.deferred.score).toBe(promise);
      expect(isDeferred(payload)).toBe(true);
    });

    it("freezes the payload", () => {
      const payload = defer({
        critical: { name: "Alice" },
        deferred: { score: Promise.resolve(0) },
      });

      expect(Object.isFrozen(payload)).toBe(true);
    });

    it("freezes the inner deferred map (not just the payload root)", () => {
      const payload = defer({
        critical: null,
        deferred: { score: Promise.resolve(1) },
      });

      expect(Object.isFrozen(payload.deferred)).toBe(true);
    });

    it("does not freeze the caller's original deferred reference", () => {
      const userMap: Record<string, Promise<unknown>> = {
        score: Promise.resolve(1),
      };

      defer({ critical: null, deferred: userMap });

      // Caller's reference stays mutable — defer() works on a clone.
      expect(Object.isFrozen(userMap)).toBe(false);
    });

    it("isolates payload.deferred from post-construction mutations of the caller's map", () => {
      const userMap: Record<string, Promise<unknown>> = {
        score: Promise.resolve(1),
      };
      const payload = defer({ critical: null, deferred: userMap });

      // Late mutation by the caller — possibly a non-promise, possibly a
      // reserved key, possibly a synchronously-rejecting promise. None of
      // these should leak into the payload.
      const lateAdd = Promise.reject(new Error("late"));

      lateAdd.catch(() => {
        /* prevent unhandledRejection in this test */
      });
      userMap.evil = lateAdd;

      expect(Object.keys(payload.deferred)).toStrictEqual(["score"]);
      expect("evil" in payload.deferred).toBe(false);
    });

    it("supports empty deferred record", () => {
      const payload = defer({
        critical: "shell",
        deferred: {},
      });

      expect(isDeferred(payload)).toBe(true);
      expect(Object.keys(payload.deferred)).toHaveLength(0);
    });

    it("preserves promise reference identity", () => {
      const p1 = Promise.resolve("a");
      const p2 = Promise.resolve("b");
      const payload = defer({ critical: 0, deferred: { p1, p2 } });

      expect(payload.deferred.p1).toBe(p1);
      expect(payload.deferred.p2).toBe(p2);
    });
  });

  describe("validation", () => {
    it("rejects null options", () => {
      expect(() =>
        defer(
          null as unknown as {
            critical: number;
            deferred: Record<string, Promise<unknown>>;
          },
        ),
      ).toThrow(TypeError);
    });

    it("rejects non-object options", () => {
      expect(() =>
        defer(
          "invalid" as unknown as {
            critical: number;
            deferred: Record<string, Promise<unknown>>;
          },
        ),
      ).toThrow(TypeError);
    });

    it("rejects null deferred", () => {
      expect(() =>
        defer({
          critical: 1,
          deferred: null as unknown as Record<string, Promise<unknown>>,
        }),
      ).toThrow("`deferred` must be a non-null");
    });

    it("rejects non-object deferred", () => {
      expect(() =>
        defer({
          critical: 1,
          deferred: 123 as unknown as Record<string, Promise<unknown>>,
        }),
      ).toThrow("`deferred` must be a non-null");
    });

    it("rejects array deferred", () => {
      expect(() =>
        defer({
          critical: 1,
          deferred: [] as unknown as Record<string, Promise<unknown>>,
        }),
      ).toThrow("`deferred` must be a non-null");
    });

    it("rejects non-promise values in deferred", () => {
      expect(() =>
        defer({
          critical: 1,
          deferred: {
            x: 5 as unknown as Promise<unknown>,
          },
        }),
      ).toThrow(/deferred\.x.+must be a Promise/);
    });

    it("rejects null values in deferred", () => {
      expect(() =>
        defer({
          critical: 1,
          deferred: {
            x: null as unknown as Promise<unknown>,
          },
        }),
      ).toThrow(/deferred\.x.+must be a Promise/);
    });

    it("rejects __proto__ as a deferred key (prototype-pollution defence)", () => {
      expect(() =>
        defer({
          critical: 1,

          deferred: { ["__proto__" as any]: Promise.resolve(1) },
        }),
      ).toThrow(/is reserved/);
    });

    it("rejects constructor as a deferred key", () => {
      expect(() =>
        defer({
          critical: 1,
          deferred: { constructor: Promise.resolve(1) },
        }),
      ).toThrow(/is reserved/);
    });

    it("rejects prototype as a deferred key", () => {
      expect(() =>
        defer({
          critical: 1,
          deferred: { prototype: Promise.resolve(1) },
        }),
      ).toThrow(/is reserved/);
    });

    it("accepts thenables (duck-typed promises)", () => {
      const noopFn = (): void => undefined;
      const thenable = Object.assign(Object.create(null), {
        // duck-typed thenable: validator only checks `typeof then === 'function'`.
        // eslint-disable-next-line unicorn/no-thenable -- intentional duck-typed thenable for the validator
        then: noopFn,
      }) as unknown as Promise<unknown>;

      expect(() =>
        defer({
          critical: 1,
          deferred: { x: thenable },
        }),
      ).not.toThrow();
    });
  });

  describe("isDeferred()", () => {
    it("returns false for null", () => {
      expect(isDeferred(null)).toBe(false);
    });

    it("returns false for inherited brand (prototype-chain bypass)", () => {
      // The brand symbol is a `Symbol.for(...)` — anyone in the same
      // realm can fabricate it. The defence is `Object.hasOwn`: an object
      // that inherits the brand from its prototype must NOT be tagged
      // as a defer() payload, otherwise a foreign-prototype attack could
      // smuggle a no-`critical`/no-`deferred` value into the slow path
      // of processLoaderResult.
      const proto = { [DEFER_BRAND]: true };
      const inherited = Object.create(proto) as Record<symbol, unknown>;

      // Sanity: the brand IS visible via prototype lookup.
      expect(inherited[DEFER_BRAND]).toBe(true);

      // But isDeferred must reject because the brand isn't OWN.
      expect(isDeferred(inherited)).toBe(false);
    });

    it("returns true only when the brand is an OWN property", () => {
      const own: Record<symbol, unknown> = { [DEFER_BRAND]: true };

      expect(isDeferred(own)).toBe(true);
    });

    it("returns false for undefined", () => {
      expect(isDeferred(undefined)).toBe(false);
    });

    it("returns false for primitives", () => {
      expect(isDeferred(42)).toBe(false);
      expect(isDeferred("string")).toBe(false);
      expect(isDeferred(true)).toBe(false);
    });

    it("returns false for plain objects", () => {
      expect(isDeferred({})).toBe(false);
      expect(isDeferred({ critical: 1, deferred: {} })).toBe(false);
    });

    it("returns false for arrays", () => {
      expect(isDeferred([])).toBe(false);
    });

    it("returns true for defer() output", () => {
      const payload = defer({
        critical: 1,
        deferred: { x: Promise.resolve(1) },
      });

      expect(isDeferred(payload)).toBe(true);
    });
  });

  // Regression: an eagerly-rejected deferred promise (e.g. validation
  // shortcut inside the loader) used to race the server-side
  // `injectDeferredScripts` `.then(...)` attachment, emitting a Node
  // `unhandledRejection` warning before the wire-format settler had a
  // chance to register. defer() now attaches a no-op sibling handler at
  // construction time so the runtime sees the promise as "handled".
  describe("unhandled-rejection suppression", () => {
    it("does not emit unhandledRejection when a deferred promise rejects synchronously", async () => {
      const seen: unknown[] = [];
      const onReject = (reason: unknown): void => {
        seen.push(reason);
      };

      process.on("unhandledRejection", onReject);

      try {
        const failing = Promise.reject(new Error("eager"));

        defer({ critical: null, deferred: { failing } });

        // Macrotask + microtask drain so unhandledRejection has a chance
        // to fire if the suppression broke.
        await new Promise((r) => setTimeout(r, 10));
        await Promise.resolve();

        expect(seen).toHaveLength(0);

        // The original rejection is still observable downstream — the
        // sibling `.catch(() => {})` does NOT consume it, only marks it
        // as handled for Node's tracker.
        await expect(failing).rejects.toThrow("eager");
      } finally {
        process.off("unhandledRejection", onReject);
      }
    });
  });
});
