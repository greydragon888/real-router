import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "../../src/validationPlugin";

import type { Router } from "@real-router/core";

/**
 * The guard registrations, the guard answers and the listener count refuse
 * through checks and report through diagnostic kinds (#2388).
 *
 * At `maxLifecycleHandlers: 10` the thresholds sit at 2 and 5, and at
 * `maxListeners: 50` at 10 and 25 (`computeThresholds`), so a row reaches its
 * own registration with a handful of calls.
 */
const MAX_HANDLERS = 10;

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "items", path: "/items/:id" },
];

/** What the router logged, one line per call: level, channel, message, args. */
const routerWithSink = (
  mode: "bare" | "installed" | "torn down",
): { router: Router; logged: string[] } => {
  const logged: string[] = [];
  const router = createRouter(ROUTES, {
    limits: {
      maxLifecycleHandlers: MAX_HANDLERS,
      maxListeners: 50,
      warnListeners: 50,
    },
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

/** Registers a guard of `type` on `count` routes no guard holds yet. */
const guards = (
  router: Router,
  type: "activate" | "deactivate",
  count: number,
): void => {
  const lifecycle = getLifecycleApi(router);

  for (let index = 0; index < count; index++) {
    if (type === "activate") {
      lifecycle.addActivateGuard(`g${index}`, () => () => true);
    } else {
      lifecycle.addDeactivateGuard(`g${index}`, () => () => true);
    }
  }
};

describe("teardown removes every guard and listener registration (#2388)", () => {
  // ⚑ One row per registration: an input it refuses or reports and bare core
  // does not, after teardown too. The installed arm asserts that the row
  // reaches the plugin at all.
  const ROWS: readonly (readonly [
    label: string,
    run: (router: Router) => Promise<void> | void,
  ])[] = [
    [
      "canActivate:count",
      (router) => {
        guards(router, "activate", MAX_HANDLERS + 1);
      },
    ],
    [
      "canDeactivate:count",
      (router) => {
        guards(router, "deactivate", MAX_HANDLERS + 1);
      },
    ],
    [
      "CAN_ACTIVATE_COUNT",
      (router) => {
        guards(router, "activate", 2);
      },
    ],
    [
      "CAN_DEACTIVATE_COUNT",
      (router) => {
        guards(router, "deactivate", 2);
      },
    ],
    [
      "CAN_ACTIVATE_OVERWRITE",
      (router) => {
        getLifecycleApi(router).addActivateGuard("home", () => () => true);
        getLifecycleApi(router).addActivateGuard("home", () => () => false);
      },
    ],
    [
      "CAN_DEACTIVATE_OVERWRITE",
      (router) => {
        getLifecycleApi(router).addDeactivateGuard("home", () => () => true);
        getLifecycleApi(router).addDeactivateGuard("home", () => () => false);
      },
    ],
    [
      "SYNC_GUARD_THENABLE",
      async (router) => {
        await router.start("/home");
        getLifecycleApi(router).addActivateGuard(
          "items",
          () => async () => true,
        );
        router.canNavigateTo("items", { id: "1" });
      },
    ],
    [
      "SYNC_GUARD_NON_BOOLEAN",
      async (router) => {
        await router.start("/home");
        getLifecycleApi(router).addActivateGuard(
          "items",
          () => () => "login" as never,
        );
        router.canNavigateTo("items", { id: "1" });
      },
    ],
    [
      "GUARD_NON_BOOLEAN",
      async (router) => {
        await router.start("/home");
        getLifecycleApi(router).addActivateGuard(
          "items",
          () => () => "login" as never,
        );
        await router.navigate("items", { id: "1" }).catch(() => undefined);
      },
    ],
    [
      "LISTENER_COUNT",
      (router) => {
        for (let index = 0; index < 10; index++) {
          router.subscribe(() => {});
        }
      },
    ],
  ];

  const outcomeOf = async (
    mode: "bare" | "installed" | "torn down",
    run: (router: Router) => Promise<void> | void,
  ) => {
    const { router, logged } = routerWithSink(mode);
    let thrown = "no throw";

    try {
      await run(router);
    } catch (error) {
      thrown = (error as Error).message;
    }

    router.dispose();

    return { thrown, logged };
  };

  it("CONTROL — the table holds one row per registration", () => {
    expect(ROWS).toHaveLength(10);
  });

  it.each(ROWS)(
    "%s: after teardown the door answers as bare core does",
    async (_label, run) => {
      const bare = await outcomeOf("bare", run);

      await expect(
        outcomeOf("installed", run),
        "the row reaches the plugin",
      ).resolves.not.toStrictEqual(bare);
      await expect(outcomeOf("torn down", run)).resolves.toStrictEqual(bare);
    },
  );
});

describe("one count, a refusal and a report (#2388)", () => {
  const TYPES = [
    ["activate", "canActivate"],
    ["deactivate", "canDeactivate"],
  ] as const;

  it("CONTROL — the table holds both guard types", () => {
    expect(TYPES).toHaveLength(2);
  });

  it.each(TYPES)(
    "a %s guard the limit refuses is refused under its type's door, and not reported",
    (type, door) => {
      // ⚑ Core asks the count position before it raises the count kind. The
      // refused registration would make the count one over the limit, so a
      // report raised first would log it.
      const { router, logged } = routerWithSink("installed");
      const lifecycle = getLifecycleApi(router);

      guards(router, type, MAX_HANDLERS);
      logged.length = 0;

      expect(() => {
        if (type === "activate") {
          lifecycle.addActivateGuard("refused", () => () => true);
        } else {
          lifecycle.addDeactivateGuard("refused", () => () => true);
        }
      }).toThrow(
        new RangeError(
          `[router.${door}] Lifecycle handler limit exceeded (${MAX_HANDLERS}). This indicates too many routes with individual handlers. Consider using plugins for cross-cutting concerns.`,
        ),
      );
      expect(logged).toStrictEqual([]);

      router.dispose();
    },
  );
});
