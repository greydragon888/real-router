import { describe, expect, it, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import type { Route } from "@real-router/core/types";

/**
 * The logger config is read ONCE per field, and validated where it is stored
 * (#1814 + #1842).
 *
 * The caller's bag went through TWO independent readers — `assertLoggerConfig`
 * in the constructor and `RouterLogger.configure` a few lines later — and they
 * disagreed in two ways at once:
 *
 *   • `in` vs `hasOwn` (#1814a): the guard admitted an INHERITED `callback`, the
 *     store required an own one, so a working sink was accepted and never
 *     installed;
 *   • validate-here / use-there (#1814b, #1842): the guard's `typeof` checks
 *     never reached the value `configure` stored, so a field answering a valid
 *     shape to the guard and something else afterwards was installed unchecked.
 *
 * ⚑ The rule is core's own, from `src/engine/CLAUDE.md`: *a guard that admits by
 * a computed key must hand the KEY downstream, never the value it computed it
 * from.*
 */
describe("the logger config is read once per field (#1814, #1842)", () => {
  const ROUTES = [{ name: "home", path: "/home" }] as unknown as Route[];

  /** Drives a real log line through the router's own warning channel. */
  const drive = (router: ReturnType<typeof createRouter>): void => {
    getRoutesApi(router).remove("does-not-exist");
  };

  it("the guard agrees with itself, and with the canon, about inherited keys", () => {
    // ⚠ #1814 frames this half as "core accepted the sink and dropped it", which
    // reads as "install it". That is the wrong resolution: `CLAUDE.md`
    // "Supported Input Shapes" is own-enumerable-only, so an inherited key is
    // not supported input and being ignored is CORRECT. What is wrong is that
    // the guard disagreed with itself — measured before the fix:
    //
    //   inherited `callback` = non-function   REFUSED  ("in" saw it)
    //   inherited `level`    = garbage        REFUSED  ("in" saw it)
    //   inherited UNKNOWN property            ACCEPTED (the key scan is own-only)
    //
    // The first two are FALSE REJECTIONS: a bag whose OWN keys are empty is a
    // valid empty config, refused for something on its prototype.
    const inheritedBadCallback = Object.create({
      callback: "NOT-A-FUNCTION",
    }) as never;
    const inheritedBadLevel = Object.create({ level: "GARBAGE" }) as never;

    expect(() => {
      createRouter(ROUTES, { logger: inheritedBadCallback }).dispose();
    }).not.toThrow();
    expect(() => {
      createRouter(ROUTES, { logger: inheritedBadLevel }).dispose();
    }).not.toThrow();

    // And the sink half: an inherited callback is IGNORED, not installed — the
    // outcome was already right, only its reasoning was not.
    let calls = 0;
    const callback = (): void => {
      calls += 1;
    };
    const router = createRouter(ROUTES, {
      logger: Object.create({ level: "all", callback }) as never,
    });

    drive(router);

    expect(calls, "inherited is not supported input").toBe(0);

    router.dispose();
  });

  it("CONTROL — an own callback still works, and is what the inherited row is measured against", () => {
    let calls = 0;
    const callback = (): void => {
      calls += 1;
    };
    const router = createRouter(ROUTES, {
      logger: { level: "all", callback },
    } as never);

    drive(router);

    expect(calls).toBe(1);

    router.dispose();
  });

  it("each field is read exactly once", () => {
    // Measured before the fix: level, level, callback, callback,
    // callbackIgnoresLevel, callbackIgnoresLevel (the guard, twice each), then
    // level, callback, callbackIgnoresLevel (configure) — three apiece.
    const reads: string[] = [];
    const config = {};

    for (const key of ["level", "callback", "callbackIgnoresLevel"] as const) {
      Object.defineProperty(config, key, {
        enumerable: true,
        configurable: true,
        get() {
          reads.push(key);

          if (key === "level") {
            return "all";
          }

          if (key === "callback") {
            return (): void => undefined;
          }

          return false;
        },
      });
    }

    const router = createRouter(ROUTES, { logger: config });

    router.dispose();

    expect(reads).toStrictEqual(["level", "callback", "callbackIgnoresLevel"]);
  });

  it("a drifting callback cannot install a non-function (#1814b)", () => {
    // ⚑ The half #1814 could not capture — "the mechanism as traced, not a run I
    // captured". Captured here: flipping after read 2 (the guard's two) let
    // `configure` store the string, and the router's own error channel died for
    // the life of the instance with
    // `TypeError: this[#config].callback is not a function`.
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.join(" "));
    });

    let reads = 0;
    const config = {
      level: "all",
      get callback() {
        reads += 1;

        return reads <= 2 ? (): void => undefined : "NOT-A-FUNCTION";
      },
    };

    let calls = 0;
    const config2 = {
      level: "all",
      get callback() {
        reads += 1;

        return reads <= 2
          ? (): void => {
              calls += 1;
            }
          : "NOT-A-FUNCTION";
      },
    };
    const router = createRouter(ROUTES, { logger: config2 } as never);

    drive(router);
    spy.mockRestore();
    router.dispose();

    // One read, so the FIRST answer is the one installed — the doctrine this
    // family settled on. The sink works and the error channel is alive.
    expect(reads, "one read, so there is no later answer").toBe(1);
    expect(calls, "the function the guard checked is the one that runs").toBe(
      1,
    );
    expect(errors).toStrictEqual([]);

    void config;
  });

  it("a drifting level cannot disable the threshold (#1842)", () => {
    // ⚑ The `typeof === "string"` gate lives in `assertLoggerConfig`; `configure`
    // asked `hasOwn(LEVEL_CONFIGS, level)` and then indexed with the same value,
    // coercing it TWICE more. Measured before the fix: a level answering "none"
    // to the guard and a bag whose `toString` says "none" then "bogus" to
    // `configure` CONSTRUCTED FINE and let a warning through — `level: "none"`
    // is the setting that suppresses everything.
    const warns: unknown[] = [];
    const spy = vi.spyOn(console, "warn").mockImplementation((...args) => {
      warns.push(args.join(" "));
    });

    let coercions = 0;
    const drifting = {
      toString() {
        coercions += 1;

        return coercions <= 1 ? "none" : "bogus";
      },
    };
    let levelReads = 0;
    const config = {
      get level() {
        levelReads += 1;

        return levelReads <= 2 ? "none" : (drifting as unknown as string);
      },
    };

    let built = true;

    try {
      const router = createRouter(ROUTES, { logger: config } as never);

      drive(router);
      router.dispose();
    } catch {
      built = false;
    }

    spy.mockRestore();

    // Either outcome is acceptable — refused at the door, or admitted as the
    // FIRST read named ("none", which suppresses). What must not happen is
    // "constructed fine AND the threshold stopped working".
    expect(built && warns.length > 0, "level 'none' must suppress").toBe(false);
  });

  it("CONTROL — a stable level: 'none' suppresses, 'all' does not", () => {
    const seen: number[] = [];

    for (const level of ["none", "all"]) {
      const warns: unknown[] = [];
      const spy = vi.spyOn(console, "warn").mockImplementation((...args) => {
        warns.push(args.join(" "));
      });
      const router = createRouter(ROUTES, { logger: { level } } as never);

      drive(router);
      spy.mockRestore();
      seen.push(warns.length);
      router.dispose();
    }

    expect(seen).toStrictEqual([0, 1]);
  });
});
