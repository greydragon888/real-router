import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core";

/**
 * The normalised logger config neither writes nor reads through the prototype
 * (#2138 / #1852).
 *
 * `assertLoggerConfig` built `normalized` as a plain object literal, wrote three
 * slots into it, and `RouterLogger.configure` read those three back out. With an
 * ordinary prototype an ambient member therefore sat on BOTH sides of one
 * record — and the trigger is not a hostile caller but a polyfill or a
 * dependency that extended `Object.prototype`. The caller's own config is
 * perfectly ordinary; the write simply lands somewhere else, or the read invents
 * a value nobody supplied.
 *
 * ⚠ The READ pole is the worse one and the issue does not name it: a plain
 * `Object.prototype.level = "none"` DATA property — no accessor at all — made
 * `configure({})` silence every log for a caller who asked for nothing.
 *
 * ⚠ `callback` fails SILENTLY on the write pole: `configure({ callback:
 * undefined })` CLEARS the sink, and `configure` decides that by asking `hasOwn`
 * of the normalised record, so a swallowed write leaves the old sink live.
 */
describe("the logger config neither writes nor reads through the prototype (#2138)", () => {
  type Any = Record<string, unknown>;
  interface LoggerDoor {
    configure: (config: Any) => void;
    getConfig: () => { level: string; callbackIgnoresLevel?: boolean };
    warn: (context: string, message: string) => void;
  }

  const proto = Object.prototype as unknown as Any;

  const makeRouter = (options: Any = {}): Router =>
    createRouter([{ name: "a", path: "/a" }] as never, options as never);

  const loggerOf = (router: Router): LoggerDoor =>
    (getInternals(router) as unknown as { logger: LoggerDoor }).logger;

  /** Installs an ambient member for each key and always removes it. */
  const under = <T>(
    keys: readonly string[],
    descriptorFor: (seen: unknown[]) => PropertyDescriptor,
    scenario: () => T,
  ): { seen: unknown[]; result: T | string } => {
    const seen: unknown[] = [];

    for (const key of keys) {
      Object.defineProperty(proto, key, descriptorFor(seen));
    }

    try {
      return { seen, result: scenario() };
    } catch (error) {
      return {
        seen,
        result: `throws:${(error as Error).message.slice(0, 70)}`,
      };
    } finally {
      for (const key of keys) {
        delete proto[key];
      }
    }
  };

  const setterDescriptor = (seen: unknown[]): PropertyDescriptor => ({
    configurable: true,
    get: (): unknown => undefined,
    set(value: unknown): void {
      seen.push(value);
    },
  });

  const getterOnly = (): PropertyDescriptor => ({
    configurable: true,
    get: (): unknown => undefined,
  });

  it("an ambient setter never sees a slot, on either door", () => {
    const table: Record<string, unknown> = {};

    {
      const router = makeRouter();
      const run = under(
        ["level", "callbackIgnoresLevel"],
        setterDescriptor,
        () => {
          loggerOf(router).configure({
            level: "warn-error",
            callbackIgnoresLevel: true,
          });

          const config = loggerOf(router).getConfig();

          return `${config.level}/${String(config.callbackIgnoresLevel)}`;
        },
      );

      table.configure = { setterSaw: run.seen, resolved: run.result };
      router.dispose();
    }

    {
      // The CONSTRUCTOR door reaches `assertLoggerConfig` through its own call
      // site, so a fix on `configure` alone would leave it short.
      const run = under(["level"], setterDescriptor, () => {
        const router = makeRouter({ logger: { level: "warn-error" } });
        const resolved = loggerOf(router).getConfig().level;

        router.dispose();

        return resolved;
      });

      table.ctor = { setterSaw: run.seen, resolved: run.result };
    }

    expect(table).toStrictEqual({
      configure: { setterSaw: [], resolved: "warn-error/true" },
      ctor: { setterSaw: [], resolved: "warn-error" },
    });
  });

  it("a cleared callback sink really stops receiving", () => {
    // The silent one. `configure({ callback: undefined })` clears the sink, and
    // the decision is `hasOwn` of the normalised record — so a swallowed write
    // leaves the key absent and the old sink alive, with no error anywhere.
    const received: string[] = [];
    const router = makeRouter({
      logger: {
        level: "all",
        callback: (_l: unknown, _c: unknown, message: string) => {
          received.push(message);
        },
      },
    });

    loggerOf(router).warn("ctx", "BEFORE-CLEAR");

    const before = received.length;
    const run = under(["callback"], setterDescriptor, () => {
      loggerOf(router).configure({ callback: undefined });
      loggerOf(router).warn("ctx", "AFTER-CLEAR");

      return received.length - before;
    });

    expect({
      sinkWasLive: before,
      setterSaw: run.seen.length,
      receivedAfterClear: run.result,
    }).toStrictEqual({
      sinkWasLive: 1,
      setterSaw: 0,
      receivedAfterClear: 0,
    });

    router.dispose();
  });

  it("a getter-only ambient slot does not throw out of configure()", () => {
    const table: Record<string, unknown> = {};

    for (const key of ["level", "callback", "callbackIgnoresLevel"] as const) {
      const router = makeRouter();
      const run = under([key], getterOnly, () => {
        loggerOf(router).configure({
          level: "warn-error",
          callback: undefined,
          callbackIgnoresLevel: true,
        });

        return loggerOf(router).getConfig().level;
      });

      table[key] = run.result;
      router.dispose();
    }

    expect(table).toStrictEqual({
      level: "warn-error",
      callback: "warn-error",
      callbackIgnoresLevel: "warn-error",
    });
  });

  it("an ambient DATA property is not read back out of the record", () => {
    // ⚠ The other pole, and it needs no accessor at all. The caller asks for
    // NOTHING; an ordinary data property on `Object.prototype` supplied the
    // answer, and `level: "none"` silences every log.
    const router = makeRouter();

    proto.level = "none";
    proto.callbackIgnoresLevel = true;

    let resolved: string;

    try {
      loggerOf(router).configure({});

      const config = loggerOf(router).getConfig();

      resolved = `${config.level}/${String(config.callbackIgnoresLevel)}`;
    } catch (error) {
      resolved = `throws:${(error as Error).message.slice(0, 50)}`;
    } finally {
      delete proto.level;
      delete proto.callbackIgnoresLevel;
      router.dispose();
    }

    // The defaults are `all` / `false`; an empty `configure({})` leaves both.
    expect(resolved).toStrictEqual("all/false");
  });

  it("CONTROL — with no ambient member every slot still lands", () => {
    const router = makeRouter();

    loggerOf(router).configure({
      level: "error-only",
      callbackIgnoresLevel: true,
    });

    const config = loggerOf(router).getConfig();

    expect(`${config.level}/${String(config.callbackIgnoresLevel)}`).toBe(
      "error-only/true",
    );

    router.dispose();
  });
});
