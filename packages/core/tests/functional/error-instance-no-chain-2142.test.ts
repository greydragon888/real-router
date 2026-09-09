import { describe, expect, it } from "vitest";

import { RouterError } from "@real-router/core";

/**
 * `setErrorInstance` records the native error's fields as OWN data (#2142 /
 * #1852).
 *
 * The three slots were copied with `[[Set]]`, and `cause` is the one that has no
 * own slot on an `Error` instance unless the constructor was given one — so an
 * ambient `Object.prototype.cause` hijacks the write, and a getter-only one
 * makes the assignment THROW.
 *
 * ⚠ Throwing here is the worst case in the file: `setErrorInstance` is what
 * wraps a native failure into the router's own error, so the throw replaces the
 * error being reported with a different one, from inside error handling.
 */
describe("setErrorInstance records fields as own data (#2142)", () => {
  type Any = Record<string, unknown>;

  const proto = Object.prototype as unknown as Any;

  const under = <T>(
    key: string,
    withSetter: boolean,
    scenario: () => T,
  ): { seen: unknown[]; result: T | string } => {
    const seen: unknown[] = [];
    const descriptor: PropertyDescriptor = {
      configurable: true,
      get: (): unknown => undefined,
    };

    if (withSetter) {
      descriptor.set = function (value: unknown): void {
        seen.push(String(value));
      };
    }

    Object.defineProperty(proto, key, descriptor);

    try {
      return { seen, result: scenario() };
    } catch (error) {
      return {
        seen,
        result: `throws:${(error as Error).message.slice(0, 70)}`,
      };
    } finally {
      delete proto[key];
    }
  };

  /**
   * All three slots the method copies, each under an ambient SETTER.
   *
   * ⚠ Only `cause` was ever live, and the row set is what says so rather than a
   * sentence: `message` is own on every instance because `super(message ?? code)`
   * always passes a string, and `stack` is installed by the `Error` constructor.
   * The report names all three; two of the rows are controls that were green
   * before the fix and stay green after it.
   */
  it("an ambient setter never sees any of the three slots", () => {
    const table: Record<string, unknown> = {};

    for (const key of ["message", "cause", "stack"] as const) {
      const run = under(key, true, () => {
        const routerError = new RouterError("TEST_CODE", {
          message: "original",
        });
        const native = new Error("native message", { cause: "THE-CAUSE" });

        native.stack = "THE-STACK";
        routerError.setErrorInstance(native);

        return {
          own: Object.hasOwn(routerError, key),
          value: String((routerError as unknown as Any)[key]).slice(0, 14),
        };
      });

      table[key] = { setterSaw: run.seen, ...(run.result as object) };
    }

    expect(table).toStrictEqual({
      message: { setterSaw: [], own: true, value: "native message" },
      cause: { setterSaw: [], own: true, value: "THE-CAUSE" },
      stack: { setterSaw: [], own: true, value: "THE-STACK" },
    });
  });

  it("a getter-only ambient slot does not throw out of error handling", () => {
    const table: Record<string, unknown> = {};

    for (const key of ["message", "cause", "stack"] as const) {
      const run = under(key, false, () => {
        const routerError = new RouterError("TEST_CODE", {
          message: "original",
        });

        routerError.setErrorInstance(new Error("native message"));

        return routerError.message;
      });

      table[key] = run.result;
    }

    expect(table).toStrictEqual({
      message: "native message",
      cause: "native message",
      stack: "native message",
    });
  });

  it("CONTROL — with no ambient member the three slots still copy", () => {
    const routerError = new RouterError("TEST_CODE", { message: "original" });
    const native = new Error("native message", { cause: "THE-CAUSE" });

    native.stack = "THE-STACK";
    routerError.setErrorInstance(native);

    expect({
      message: routerError.message,
      cause: (routerError as unknown as Any).cause,
      stack: routerError.stack,
    }).toStrictEqual({
      message: "native message",
      cause: "THE-CAUSE",
      stack: "THE-STACK",
    });
  });
});
