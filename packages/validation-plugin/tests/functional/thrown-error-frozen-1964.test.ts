// packages/validation-plugin/tests/functional/thrown-error-frozen-1964.test.ts

import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "../../src";

/**
 * An error this plugin THROWS is frozen, like core's own (#1960 / #1964).
 *
 * Keyed on the DOOR that can reject — registration after `start()` — and not on
 * the `new RouterError` line, which is what would go stale if the throw moved.
 *
 * ⚠ The reason is not that a write here corrupts anything: this instance is
 * fresh per throw and reaches one `catch`. It is that a consumer cannot tell
 * WHICH package produced the error it caught, so a rule core applies to every
 * throw of its own and a plugin applies to none is a distinction the catch site
 * has to know about to be safe.
 */
describe("a thrown RouterError is frozen (#1964)", () => {
  it("usePlugin after start", async () => {
    const router = createRouter([{ name: "home", path: "/home" }]);

    await router.start("/home");

    let caught: unknown;

    try {
      router.usePlugin(validationPlugin());
    } catch (error) {
      caught = error;
    }

    expect(caught, "the door rejected").toBeDefined();
    expect(Object.isFrozen(caught)).toBe(true);
    expect(() => {
      (caught as Record<string, unknown>).appCode = 1;
    }).toThrow(TypeError);

    router.dispose();
  });

  it("CONTROL: the door still rejects for its own reason", async () => {
    const router = createRouter([{ name: "home", path: "/home" }]);

    await router.start("/home");

    // Without this the cell above is satisfied by any frozen object, including
    // one thrown for an unrelated reason.
    expect(() => router.usePlugin(validationPlugin())).toThrow(
      "validation-plugin must be registered before router.start()",
    );

    router.dispose();
  });

  it("CONTROL: before start the door does not reject at all", () => {
    const router = createRouter([{ name: "home", path: "/home" }]);

    expect(() => router.usePlugin(validationPlugin())).not.toThrow();

    router.dispose();
  });
});
