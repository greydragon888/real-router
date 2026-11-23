import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Plugin, PluginFactory, Router } from "@real-router/core";
import type { DiagnosticEventMap } from "@real-router/core/types";

/**
 * `usePlugin` on the check and diagnostic channels (#2388), on a router with
 * no plugin installed: what each position and kind receives, and when.
 *
 * ⚑ `@real-router/validation-plugin` registers every consumer of the door at
 * once, so its suites cannot tell which position makes core compute what it
 * judges. The "lone consumer" cells below can: each registers one.
 */
const POSITIONS = [
  "usePlugin:count",
  "usePlugin:entry",
  "usePlugin:plugin",
] as const;

/**
 * The kinds `DiagnosticEventMap` names after `usePlugin`. One named so and
 * missing from `KINDS` fails type-check in the counting cell below.
 */
type UsePluginKind = Extract<keyof DiagnosticEventMap, `USE_PLUGIN_${string}`>;

const KINDS = [
  "USE_PLUGIN_COUNT",
  "USE_PLUGIN_DUPLICATE_IN_BATCH",
  "USE_PLUGIN_HOOK_NOT_FUNCTION",
] as const satisfies readonly UsePluginKind[];

/** The resolved default of `limits.maxPlugins`. */
const MAX = 50;

/** Every position and kind of the step, into one log, in the order they run. */
const listenToAll = (router: Router, log: unknown[][]): void => {
  const api = getPluginApi(router);

  for (const position of POSITIONS) {
    api.addCheck(position, (...args: unknown[]) => {
      log.push([position, ...args]);
    });
  }

  for (const kind of KINDS) {
    api.subscribeDiagnostic(kind, (...args: unknown[]) => {
      log.push([kind, ...args]);
    });
  }
};

/** A factory that logs its own run and returns `plugin`. */
const factoryOf = (
  log: unknown[][],
  name: string,
  plugin: Plugin = {},
): PluginFactory => {
  return () => {
    log.push(["factory", name]);

    return plugin;
  };
};

const codeOf = (fn: () => unknown): string => {
  try {
    fn();

    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? (error as Error).message;
  }
};

describe("#2388 — usePlugin on the channels", () => {
  describe("what each position and kind receives", () => {
    it("one factory: the count, its entry, the count report, the factory, then its object", () => {
      const router = createRouter([]);
      const log: unknown[][] = [];
      const held: PluginFactory = () => ({});

      router.usePlugin(held);
      listenToAll(router, log);

      const plugin: Plugin = { onStop: vi.fn() };
      const factory = factoryOf(log, "f", plugin);

      router.usePlugin(factory);

      expect(log).toStrictEqual([
        ["usePlugin:count", 1, 1, MAX],
        ["usePlugin:entry", factory, [held]],
        ["USE_PLUGIN_COUNT", 2],
        ["factory", "f"],
        ["usePlugin:plugin", plugin],
      ]);

      router.dispose();
    });

    it("a batch: the count takes distinct factories, the report every argument, and a repetition is reported before any factory", () => {
      const router = createRouter([]);
      const log: unknown[][] = [];
      const first: Plugin = {};
      const second: Plugin = {};
      const a = factoryOf(log, "a", first);
      const b = factoryOf(log, "b", second);

      listenToAll(router, log);
      router.usePlugin(a, b, a);

      expect(log).toStrictEqual([
        ["usePlugin:count", 0, 2, MAX],
        ["usePlugin:entry", a, []],
        ["usePlugin:entry", b, []],
        ["usePlugin:entry", a, []],
        ["USE_PLUGIN_COUNT", 3],
        ["USE_PLUGIN_DUPLICATE_IN_BATCH"],
        ["factory", "a"],
        ["usePlugin:plugin", first],
        ["factory", "b"],
        ["usePlugin:plugin", second],
      ]);

      router.dispose();
    });

    it("distinct factories report no repetition, and a factory repeated twice is reported twice", () => {
      const router = createRouter([]);
      const log: unknown[][] = [];
      const a: PluginFactory = () => ({});
      const b: PluginFactory = () => ({});
      const c: PluginFactory = () => ({});

      getPluginApi(router).subscribeDiagnostic(
        "USE_PLUGIN_DUPLICATE_IN_BATCH",
        () => {
          log.push(["repeated"]);
        },
      );

      router.usePlugin(a, b);

      expect(log).toStrictEqual([]);

      router.usePlugin(c, c, c);

      expect(log).toStrictEqual([["repeated"], ["repeated"]]);

      router.dispose();
    });

    it("a hook that is not a function is reported by name, after the object's check", () => {
      const router = createRouter([]);
      const log: unknown[][] = [];
      const plugin = { onStart: "not a function", onStop: vi.fn() };

      listenToAll(router, log);
      router.usePlugin(factoryOf(log, "f", plugin as unknown as Plugin));

      expect(log.slice(-3)).toStrictEqual([
        ["factory", "f"],
        ["usePlugin:plugin", plugin],
        ["USE_PLUGIN_HOOK_NOT_FUNCTION", "onStart"],
      ]);

      router.dispose();
    });

    it("skipped arguments reach no position, and take no slot", () => {
      const router = createRouter([]);
      const log: unknown[][] = [];

      listenToAll(router, log);
      router.usePlugin(false, null, undefined);

      expect(log).toStrictEqual([]);

      const a = factoryOf(log, "a");

      router.usePlugin(false, a, null);

      expect(log.slice(0, 2)).toStrictEqual([
        ["usePlugin:count", 0, 1, MAX],
        ["usePlugin:entry", a, []],
      ]);

      router.dispose();
    });

    it("the count carries the resolved limit", () => {
      const router = createRouter([], { limits: { maxPlugins: 3 } });
      const seen: unknown[][] = [];

      getPluginApi(router).addCheck("usePlugin:count", (...args) => {
        seen.push(args);
      });
      router.usePlugin(() => ({}));

      expect(seen).toStrictEqual([[0, 1, 3]]);

      router.dispose();
    });
  });

  describe("a refusal stops the install where it stands", () => {
    it("a refusing count check runs nothing after it", () => {
      const router = createRouter([]);
      const log: unknown[][] = [];
      const refusal = new RangeError("count refused");

      getPluginApi(router).addCheck("usePlugin:count", () => {
        throw refusal;
      });
      listenToAll(router, log);

      const factory = factoryOf(log, "f");

      expect(() => router.usePlugin(factory)).toThrow(refusal);
      expect(log).toStrictEqual([]);

      router.dispose();
    });

    it("a refusing entry check stops the batch before its first factory", () => {
      const router = createRouter([]);
      const log: unknown[][] = [];
      const a = factoryOf(log, "a");
      const b = factoryOf(log, "b");

      getPluginApi(router).addCheck("usePlugin:entry", (factory) => {
        if (factory === b) {
          throw new Error("entry refused");
        }
      });

      expect(() => router.usePlugin(a, b)).toThrow("entry refused");
      expect(log).toStrictEqual([]);

      router.dispose();
    });

    it("a refusing object check rolls the batch back", () => {
      const router = createRouter([]);
      const log: unknown[][] = [];
      const first: Plugin = {
        teardown() {
          log.push(["teardown", "a"]);
        },
      };
      const second: Plugin = {};

      getPluginApi(router).addCheck("usePlugin:plugin", (plugin) => {
        if (plugin === second) {
          throw new Error("object refused");
        }
      });

      expect(() =>
        router.usePlugin(
          factoryOf(log, "a", first),
          factoryOf(log, "b", second),
        ),
      ).toThrow("object refused");
      expect(log).toStrictEqual([
        ["factory", "a"],
        ["factory", "b"],
        ["teardown", "a"],
      ]);

      const counts: unknown[] = [];

      getPluginApi(router).addCheck("usePlugin:count", (currentCount) => {
        counts.push(currentCount);
      });
      router.usePlugin(() => ({}));

      expect(counts).toStrictEqual([0]);

      router.dispose();
    });
  });

  describe("a lone consumer is enough for core to compute what its position judges", () => {
    // ⚑ Each cell registers ONE consumer and nothing else, so it reds when core
    // stops computing that position's arguments for a check standing alone.
    it("usePlugin:count alone receives the real counts, and can refuse", () => {
      const router = createRouter([]);
      const seen: unknown[][] = [];
      const a: PluginFactory = () => ({});
      const b: PluginFactory = () => ({});

      router.usePlugin(
        () => ({}),
        () => ({}),
      );
      getPluginApi(router).addCheck("usePlugin:count", (...args) => {
        seen.push(args);

        if (args[0] + args[1] > 3) {
          throw new RangeError("over");
        }
      });
      router.usePlugin(a, a);

      expect(seen).toStrictEqual([[2, 1, MAX]]);
      expect(() => router.usePlugin(a, b)).toThrow("over");

      router.dispose();
    });

    it("usePlugin:entry alone receives each factory and the registered list", () => {
      const router = createRouter([]);
      const seen: unknown[][] = [];
      const held: PluginFactory = () => ({});
      const a: PluginFactory = () => ({});

      router.usePlugin(held);
      getPluginApi(router).addCheck("usePlugin:entry", (...args) => {
        seen.push(args);
      });
      router.usePlugin(a);

      expect(seen).toStrictEqual([[a, [held]]]);

      router.dispose();
    });
  });

  describe("a report handler that throws is isolated", () => {
    // ⚑ The install completes as if the handler had returned, and the emitter
    // logs the throw. An async handler's rejection is logged the same way once
    // it settles (#2836).
    const ROWS = [
      {
        kind: "USE_PLUGIN_COUNT",
        install: (router: Router, factory: PluginFactory) =>
          router.usePlugin(factory),
        hook: undefined,
      },
      {
        kind: "USE_PLUGIN_DUPLICATE_IN_BATCH",
        install: (router: Router, factory: PluginFactory) =>
          router.usePlugin(factory, factory),
        hook: undefined,
      },
      {
        kind: "USE_PLUGIN_HOOK_NOT_FUNCTION",
        install: (router: Router, factory: PluginFactory) =>
          router.usePlugin(factory),
        hook: "not a function",
      },
    ] as const;

    it.each(ROWS)(
      "$kind: the install completes, and the throw reaches logger.error",
      ({ kind, install, hook }) => {
        const errors: unknown[][] = [];
        const router = createRouter([], {
          logger: {
            level: "none",
            callbackIgnoresLevel: true,
            callback: (level, context, message, ...args) => {
              if (level === "error") {
                errors.push([context, message, ...args]);
              }
            },
          },
        });
        const fault = new Error(`handler of ${kind}`);
        const teardown = vi.fn();
        const factory = vi.fn(
          () => ({ onStart: hook, teardown }) as unknown as Plugin,
        );

        getPluginApi(router).subscribeDiagnostic(kind, () => {
          throw fault;
        });

        let unsubscribe = (): void => {};

        expect(
          codeOf(() => {
            unsubscribe = install(router, factory);
          }),
        ).toBe("ok");
        expect(factory).toHaveBeenCalledTimes(1);
        expect(errors).toStrictEqual([
          ["router", `Error in listener for ${kind}:`, fault],
        ]);

        unsubscribe();

        expect(teardown).toHaveBeenCalledTimes(1);

        router.dispose();
      },
    );

    it("the table holds every kind of the step, once", () => {
      expectTypeOf<
        Exclude<UsePluginKind, (typeof KINDS)[number]>
      >().toBeNever();

      expect(ROWS).toHaveLength(KINDS.length);
      expect(ROWS.map(({ kind }) => kind)).toStrictEqual([...KINDS]);
    });
  });

  const disposedOf = (install: () => unknown) => {
    let thrown: unknown;

    try {
      install();
    } catch (error) {
      thrown = error;
    }

    return {
      code: (thrown as { code?: string } | undefined)?.code,
      message: (thrown as Error | undefined)?.message,
    };
  };

  const DISPOSED = {
    code: errorCodes.ROUTER_DISPOSED,
    message:
      "[router.usePlugin] cannot install a plugin on a disposed router — dispose() is terminal",
  };

  describe("application code that disposes the router before a factory runs stops the install", () => {
    // ⚑ A check at `usePlugin:count` or `usePlugin:entry` and a handler of a
    // kind raised before the first factory run application code between the
    // facade's question and the factory. Core asks again before each factory,
    // so none runs on a disposed router.
    it.each(["usePlugin:count", "usePlugin:entry"] as const)(
      "a check at %s that disposes the router",
      (position) => {
        const router = createRouter([]);
        const factory = vi.fn(() => ({}));

        getPluginApi(router).addCheck(position, () => {
          router.dispose();
        });

        expect(disposedOf(() => router.usePlugin(factory))).toStrictEqual(
          DISPOSED,
        );
        expect(factory).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["USE_PLUGIN_COUNT", 1],
      ["USE_PLUGIN_DUPLICATE_IN_BATCH", 2],
    ] as const)(
      "a handler of %s that disposes the router",
      (kind, arguments_) => {
        const router = createRouter([]);
        const factory = vi.fn(() => ({}));

        getPluginApi(router).subscribeDiagnostic(kind, () => {
          router.dispose();
        });

        expect(
          disposedOf(() =>
            router.usePlugin(
              ...Array.from({ length: arguments_ }, () => factory),
            ),
          ),
        ).toStrictEqual(DISPOSED);
        expect(factory).not.toHaveBeenCalled();
      },
    );
  });

  describe("application code that disposes the router during a plugin's start tears that plugin down", () => {
    // ⚑ Nothing has registered the plugin yet, so `dispose()` did not reach
    // it. Core asks once more after the start, tears the plugin down and
    // refuses; in a batch, the plugins started before it roll back.
    const ROWS = [
      {
        label: "the factory itself",
        install: (router: Router, plugin: Plugin) =>
          router.usePlugin((r) => {
            r.dispose();

            return plugin;
          }),
      },
      {
        label: "a check at usePlugin:plugin",
        install: (router: Router, plugin: Plugin) => {
          getPluginApi(router).addCheck("usePlugin:plugin", () => {
            router.dispose();
          });

          return router.usePlugin(() => plugin);
        },
      },
      {
        label: "a handler of USE_PLUGIN_HOOK_NOT_FUNCTION",
        install: (router: Router, plugin: Plugin) => {
          getPluginApi(router).subscribeDiagnostic(
            "USE_PLUGIN_HOOK_NOT_FUNCTION",
            () => {
              router.dispose();
            },
          );

          return router.usePlugin(
            () => ({ ...plugin, onStart: "skipped" }) as unknown as Plugin,
          );
        },
      },
    ] as const;

    it.each(ROWS)(
      "$label: the call refuses, and the plugin's teardown has run",
      ({ install }) => {
        const router = createRouter([]);
        const teardown = vi.fn();

        expect(disposedOf(() => install(router, { teardown }))).toStrictEqual(
          DISPOSED,
        );
        expect(teardown).toHaveBeenCalledTimes(1);
      },
    );

    it("an earlier factory of the batch that disposes the router: the next does not run, and the earlier one is torn down", () => {
      const router = createRouter([]);
      const teardown = vi.fn();
      const later = vi.fn(() => ({}));
      const earlier: PluginFactory = (r) => {
        r.dispose();

        return { teardown };
      };

      expect(disposedOf(() => router.usePlugin(earlier, later))).toStrictEqual(
        DISPOSED,
      );
      expect(later).not.toHaveBeenCalled();
      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it("a later factory of the batch that disposes the router: the batch rolls back", () => {
      const router = createRouter([]);
      const first = vi.fn();
      const second = vi.fn();
      const later: PluginFactory = (r) => {
        r.dispose();

        return { teardown: second };
      };

      expect(
        disposedOf(() => router.usePlugin(() => ({ teardown: first }), later)),
      ).toStrictEqual(DISPOSED);
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("a teardown that throws there is logged, and the call still refuses", () => {
      const errors: unknown[][] = [];
      const router = createRouter([], {
        logger: {
          level: "none",
          callbackIgnoresLevel: true,
          callback: (level, context, message, ...args) => {
            if (level === "error") {
              errors.push([context, message, ...args]);
            }
          },
        },
      });
      const fault = new Error("teardown");

      expect(
        disposedOf(() =>
          router.usePlugin((r) => {
            r.dispose();

            return {
              teardown() {
                throw fault;
              },
            };
          }),
        ),
      ).toStrictEqual(DISPOSED);
      expect(errors).toStrictEqual([
        ["router.usePlugin", "Cleanup error:", fault],
      ]);
    });
  });

  it("ANTI-VACUUM: with no consumer the door still works", () => {
    const router = createRouter([]);
    const teardown = vi.fn();
    const a = vi.fn(() => ({ teardown }));
    const b = vi.fn(() => ({ onStart: "skipped" }) as unknown as Plugin);

    const unsubscribe = router.usePlugin(a, b, a);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    unsubscribe();

    expect(teardown).toHaveBeenCalledTimes(1);

    router.dispose();
  });
});
