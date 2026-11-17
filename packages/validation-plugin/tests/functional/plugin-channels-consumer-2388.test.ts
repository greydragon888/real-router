import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "../../src/validationPlugin";

import type { Plugin, PluginFactory, Router } from "@real-router/core";

/**
 * `usePlugin` refuses through checks and reports through diagnostic kinds
 * (#2388).
 *
 * At the default `maxPlugins` of 50 the thresholds sit at 10 and 25
 * (`computeThresholds`), so a row that installs a few plugins reports nothing
 * but its own kind.
 */
const MAX = 50;

/** What the router logged, one line per call: level, channel, message, args. */
const routerWithSink = (
  mode: "bare" | "installed" | "torn down",
): { router: Router; logged: string[] } => {
  const logged: string[] = [];
  const router = createRouter([], {
    logger: {
      level: "none",
      callbackIgnoresLevel: true,
      callback: (level, channel, message, ...args) => {
        if (level !== "log") {
          logged.push([level, channel, message, ...args].map(String).join(" "));
        }
      },
    },
  });

  if (mode !== "bare") {
    const remove = router.usePlugin(validationPlugin());

    if (mode === "torn down") {
      remove();
    }
  }

  logged.length = 0;

  return { router, logged };
};

const factories = (count: number): PluginFactory[] =>
  Array.from({ length: count }, () => () => ({}));

describe("teardown removes every usePlugin registration (#2388)", () => {
  // ⚑ One row per registration: an input it refuses or reports and bare core
  // does not, after teardown too, when the plugin no longer takes a slot. The
  // installed arm asserts that the row reaches the plugin at all.
  const ROWS: readonly (readonly [
    label: string,
    run: (router: Router) => void,
  ])[] = [
    [
      "usePlugin:count",
      (router) => {
        // The call alone passes the limit, without the plugin's own slot.
        router.usePlugin(...factories(MAX + 1));
      },
    ],
    [
      "usePlugin:entry",
      (router) => {
        const factory: PluginFactory = () => ({});

        router.usePlugin(factory);
        router.usePlugin(factory);
      },
    ],
    [
      "usePlugin:plugin",
      (router) => {
        router.usePlugin(() => ({ unknownProp: 1 }) as unknown as Plugin);
      },
    ],
    [
      "USE_PLUGIN_COUNT",
      (router) => {
        router.usePlugin(...factories(10));
      },
    ],
    [
      "USE_PLUGIN_DUPLICATE_IN_BATCH",
      (router) => {
        const factory: PluginFactory = () => ({});

        router.usePlugin(factory, factory);
      },
    ],
    [
      "USE_PLUGIN_HOOK_NOT_FUNCTION",
      (router) => {
        router.usePlugin(() => ({ onStart: "skipped" }) as unknown as Plugin);
      },
    ],
  ];

  const outcomeOf = (
    mode: "bare" | "installed" | "torn down",
    run: (router: Router) => void,
  ) => {
    const { router, logged } = routerWithSink(mode);
    let thrown = "no throw";

    try {
      run(router);
    } catch (error) {
      thrown = (error as Error).message;
    }

    router.dispose();

    return { thrown, logged };
  };

  it.each(ROWS)(
    "%s: after teardown the door answers as bare core does",
    (_label, run) => {
      const bare = outcomeOf("bare", run);

      expect(
        outcomeOf("installed", run),
        "the row reaches the plugin",
      ).not.toStrictEqual(bare);
      expect(outcomeOf("torn down", run)).toStrictEqual(bare);
    },
  );
});

describe("one count, a refusal and a report (#2388)", () => {
  it("a call the limit refuses runs no factory and reports nothing", () => {
    // ⚑ Core asks the count position before it raises the count kind. The
    // call below would reach the error threshold, so a report raised first
    // would log it.
    const { router, logged } = routerWithSink("installed");
    let ran = 0;
    const counted = Array.from({ length: MAX }, (): PluginFactory => () => {
      ran++;

      return {};
    });

    expect(() => router.usePlugin(...counted)).toThrow(
      new RangeError(
        `[router.usePlugin] Plugin limit exceeded (${MAX}). Current: 1, Attempting to add: ${MAX}. This indicates an architectural problem. Consider consolidating plugins.`,
      ),
    );
    expect(ran).toBe(0);
    expect(logged).toStrictEqual([]);

    router.dispose();
  });
});
