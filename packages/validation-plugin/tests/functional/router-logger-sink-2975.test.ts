import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { validationPlugin } from "../../src";

import type { LogCallback, LoggerConfig, Router } from "@real-router/core";

/**
 * The plugin's own warnings go to the router's logger (#2975), so the router's
 * `logger` option — its `level` and its `callback` — applies to them. Core's
 * logger prints `[context] message`, so a message carries no `[router]` head of
 * its own: the anchored patterns below fail on one.
 */
const ROUTES = [
  { name: "home", path: "/home" },
  { name: "plain", path: "/plain" },
  { name: "users", path: "/users/:id" },
  { name: "list", path: "/list?q" },
];

/** One row per call site that writes a warning of the plugin's own. */
const WARNINGS: readonly (readonly [
  reporter: string,
  run: (router: Router) => unknown,
  message: RegExp,
])[] = [
  [
    "createDroppedQueryKeyReporter",
    (router) => router.navigate("plain", {}, { foo: "1" }),
    /^Query key "foo" is not declared on route "plain" /,
  ],
  [
    "createUndeclaredParamKeyReporter",
    (router) => router.navigate("users", { id: "1", note: "x" }),
    /^Param "note" is declared nowhere on route "users" /,
  ],
  [
    "createMisChanneledKeyReporter",
    (router) => router.buildPath("list", { q: "1" }),
    /^Route "list" declares `q` as a query param, but it was given in the `params` bag /,
  ],
];

/**
 * The router's options: the console off and every message to `callback`; the
 * `"default"` query mode drops a key the route does not declare, which is
 * what `createDroppedQueryKeyReporter` reports.
 */
const recording = (callback: LogCallback) => ({
  queryParamsMode: "default" as const,
  logger: {
    level: "none",
    callbackIgnoresLevel: true,
    callback,
  } satisfies Partial<LoggerConfig>,
});

let consoleWarn: ReturnType<typeof vi.spyOn>;

describe("validation-plugin — its warnings go to the router's logger (#2975)", () => {
  beforeEach(() => {
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarn.mockRestore();
  });

  it.each(WARNINGS)(
    '%s: the warning reaches the logger\'s callback, and level "none" keeps it off the console',
    async (_reporter, run, message) => {
      const callback = vi.fn<LogCallback>();
      const router = createRouter(ROUTES, recording(callback));

      router.usePlugin(validationPlugin());
      await router.start("/home");
      callback.mockClear();

      await run(router);

      expect(callback.mock.calls).toStrictEqual([
        ["warn", "router", expect.stringMatching(message)],
      ]);
      expect(consoleWarn).not.toHaveBeenCalled();

      router.stop();
    },
  );

  it("a clone warns through a logger with the base router's settings", () => {
    const callback = vi.fn<LogCallback>();
    const base = createRouter(ROUTES, recording(callback));

    base.usePlugin(validationPlugin());

    const clone = cloneRouter(base);

    callback.mockClear();
    clone.buildPath("list", { q: "1" });

    expect(callback.mock.calls).toStrictEqual([
      [
        "warn",
        "router",
        expect.stringMatching(/^Route "list" declares `q` as a query param/),
      ],
    ]);
    expect(consoleWarn).not.toHaveBeenCalled();

    clone.dispose();
    base.dispose();
  });
});
