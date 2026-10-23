import { describe, expect, it } from "vitest";

import {
  createRouter,
  errorCodes,
  events,
  RouterError,
  UNKNOWN_ROUTE,
} from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import type { Route, Router, State } from "@real-router/core";
import type {
  LimitsConfig,
  PluginFactory,
  Unsubscribe,
} from "@real-router/core/types";

/**
 * Each log site below names the call that reached it, or none where it cannot
 * tell the calls apart (#2821).
 *
 * The channel reaches the consumer's `logger.callback` verbatim, so the cells
 * read it there. `logger-channel-authority-2461` holds a channel's shape and
 * `door-reachability-authority-2479` the names it may carry; neither asks which
 * calls reach a site, so each site here is driven from every call its table
 * lists.
 */

const ROUTES: Route[] = [
  { name: "home", path: "/home" },
  { name: "admin", path: "/admin" },
  { name: "slow", path: "/slow" },
];

type Logged = readonly [level: string, context: string, message: string];

function routerWithLog(limits?: Partial<LimitsConfig>): {
  router: Router;
  logged: Logged[];
} {
  const logged: Logged[] = [];
  const router = createRouter(ROUTES, {
    defaultRoute: "admin",
    ...(limits === undefined ? {} : { limits }),
    logger: {
      level: "all",
      callback: (level, context, message) => {
        logged.push([level, context, message]);
      },
    },
  });

  return { router, logged };
}

const adminState = (router: Router): State =>
  getPluginApi(router).matchPath("/admin")!;

interface Call {
  readonly call: string;
  readonly run: (router: Router) => State | Promise<State>;
}

/** Calls whose returned promise the navigation suppressor settles. */
const SETTLING_CALLS: readonly Call[] = [
  { call: "navigate", run: (router) => router.navigate("admin") },
  { call: "navigateToDefault", run: (router) => router.navigateToDefault() },
  {
    call: "navigateToState",
    run: (router) => getPluginApi(router).navigateToState(adminState(router)),
  },
];

/** Calls that cancel the navigation in flight: a new navigation, or a 404. */
const CANCELLING_CALLS: readonly Call[] = [
  ...SETTLING_CALLS,
  {
    call: "navigateToNotFound",
    run: (router) => router.navigateToNotFound("/nowhere"),
  },
];

/**
 * Calls that register a listener on the router's emitter, with the event each
 * one registers on.
 */
const REGISTERING_CALLS: readonly {
  call: string;
  event: string;
  register: (router: Router) => void;
}[] = [
  {
    call: "subscribe",
    event: events.TRANSITION_SUCCESS,
    register: (router) => {
      router.subscribe(() => undefined);
    },
  },
  {
    call: "addEventListener",
    event: events.TRANSITION_SUCCESS,
    register: (router) => {
      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        () => undefined,
      );
    },
  },
  {
    call: "usePlugin",
    event: events.TRANSITION_SUCCESS,
    register: (router) => {
      router.usePlugin(() => ({ onTransitionSuccess: () => undefined }));
    },
  },
  {
    call: "subscribeChanges",
    event: "TREE_CHANGED",
    register: (router) => {
      getRoutesApi(router).subscribeChanges(() => undefined);
    },
  },
  {
    call: "subscribeDiagnostic",
    event: "PLUGIN_AFTER_START",
    register: (router) => {
      getPluginApi(router).subscribeDiagnostic(
        "PLUGIN_AFTER_START",
        () => undefined,
      );
    },
  },
];

const failingTeardown: PluginFactory = () => ({
  teardown: () => {
    throw new Error("teardown boom");
  },
});

/** One factory takes the single-plugin path of `usePlugin`, two the batch path. */
const PLUGIN_SETS: readonly { plugins: string; factories: PluginFactory[] }[] =
  [
    { plugins: "one plugin", factories: [failingTeardown] },
    { plugins: "two plugins", factories: [failingTeardown, () => ({})] },
  ];

/** Calls that tear a plugin down after `usePlugin` returned. */
const TEARDOWN_CALLS: readonly {
  call: string;
  run: (router: Router, unsubscribe: Unsubscribe) => void;
}[] = [
  {
    call: "the unsubscribe usePlugin returned",
    run: (_router, unsubscribe) => {
      unsubscribe();
    },
  },
  {
    call: "dispose",
    run: (router) => {
      router.dispose();
    },
  },
];

const throwingGuard = () => (): boolean => {
  throw new Error("guard boom");
};

/**
 * Calls that ask a route's guard synchronously, with the route whose guard they
 * ask. `run` answers whether the call took the throw for a refusal.
 */
const ASKING_CALLS: readonly {
  call: string;
  guarded: string;
  run: (router: Router) => boolean;
}[] = [
  {
    call: "canNavigateTo",
    guarded: "home",
    run: (router) => {
      getLifecycleApi(router).addDeactivateGuard("home", throwingGuard);

      return !router.canNavigateTo("admin");
    },
  },
  {
    call: "navigateToNotFound",
    guarded: "home",
    run: (router) => {
      getLifecycleApi(router).addDeactivateGuard("home", throwingGuard);

      try {
        router.navigateToNotFound("/nowhere");
      } catch (error) {
        return (
          error instanceof RouterError &&
          error.code === errorCodes.CANNOT_DEACTIVATE
        );
      }

      return false;
    },
  },
  {
    call: "replace",
    guarded: "landing",
    run: (router) => {
      getRoutesApi(router).replace([
        { name: "landing", path: "/home", canActivate: throwingGuard },
        { name: "admin", path: "/admin" },
      ]);

      return router.getState()?.name === UNKNOWN_ROUTE;
    },
  },
];

describe("the call tables", () => {
  it("CONTROL — no table has shrunk", () => {
    expect(SETTLING_CALLS).toHaveLength(3);
    expect(CANCELLING_CALLS).toHaveLength(4);
    expect(REGISTERING_CALLS).toHaveLength(5);
    expect(PLUGIN_SETS).toHaveLength(2);
    expect(TEARDOWN_CALLS).toHaveLength(2);
    expect(ASKING_CALLS).toHaveLength(3);
  });
});

describe("a whole-tree door refused mid-navigation names itself", () => {
  it("replace() logs under router.replace and leaves the tree", async () => {
    const { router, logged } = routerWithLog();
    const routes = getRoutesApi(router);

    await router.start("/home");
    getLifecycleApi(router).addActivateGuard("admin", () => () => {
      routes.replace([...ROUTES, { name: "extra", path: "/extra" }]);

      return true;
    });
    await router.navigate("admin");

    expect(logged).toStrictEqual([
      [
        "error",
        "router.replace",
        "Cannot replace routes while navigation is in progress. Wait for navigation to complete.",
      ],
    ]);
    expect(routes.has("extra")).toBe(false);

    router.dispose();
  });

  it("clear() logs under router.clear and leaves the tree", async () => {
    // A committed state makes `clear()` throw instead, so its in-flight refusal
    // is reached from a guard of the start navigation.
    const { router, logged } = routerWithLog();
    const routes = getRoutesApi(router);

    getLifecycleApi(router).addActivateGuard("admin", () => () => {
      routes.clear();

      return true;
    });
    await router.start("/admin");

    expect(logged).toStrictEqual([
      [
        "error",
        "router.clear",
        "Cannot clear routes while navigation is in progress. Wait for navigation to complete.",
      ],
    ]);
    expect(routes.has("admin")).toBe(true);

    router.dispose();
  });
});

describe("a throwing guard names the call that asked it", () => {
  it.each(ASKING_CALLS)(
    "$call logs it under its own name",
    async ({ call, guarded, run }) => {
      const { router, logged } = routerWithLog();

      await router.start("/home");

      expect(run(router)).toBe(true);
      expect(logged).toStrictEqual([
        [
          "warn",
          `router.${call}`,
          `Guard for "${guarded}" threw — treated as navigation-blocking (returned false)`,
        ],
      ]);

      router.dispose();
    },
  );
});

describe("an unexpected navigation rejection names no call", () => {
  it.each(SETTLING_CALLS)("$call logs it under router", async ({ run }) => {
    const { router, logged } = routerWithLog();

    await router.start("/home");
    router.subscribeLeave(() => {
      throw new Error("leave boom");
    });

    await expect(Promise.resolve(run(router))).rejects.toThrow("leave boom");

    expect(logged).toStrictEqual([
      ["error", "router", "Unexpected navigation error"],
    ]);

    router.dispose();
  });
});

describe("a navigation cancelled by another names no call", () => {
  it.each(CANCELLING_CALLS)("$call warns under router", async ({ run }) => {
    const { router, logged } = routerWithLog();

    await router.start("/home");
    getLifecycleApi(router).addActivateGuard(
      "slow",
      () => () => new Promise<boolean>(() => undefined),
    );

    const cancelled = router.navigate("slow");

    await run(router);

    await expect(cancelled).rejects.toThrow();

    expect(logged).toStrictEqual([
      [
        "warn",
        "router",
        "Concurrent navigation detected on shared router instance. For SSR, use cloneRouter() to create isolated instance per request.",
      ],
    ]);

    router.dispose();
  });
});

describe("a listener-count warning names no call", () => {
  it.each(REGISTERING_CALLS)(
    "$call warns under router",
    ({ event, register }) => {
      const { router, logged } = routerWithLog({
        warnListeners: 1,
        maxListeners: 10,
      });

      register(router);
      register(router);

      expect(logged).toStrictEqual([
        [
          "warn",
          "router",
          `Event "${event}" has 1 listeners — possible memory leak`,
        ],
      ]);

      router.dispose();
    },
  );
});

describe.each(PLUGIN_SETS)(
  "a teardown that throws after usePlugin returned, $plugins, names no call",
  ({ factories }) => {
    it.each(TEARDOWN_CALLS)("$call logs it under router", ({ run }) => {
      const { router, logged } = routerWithLog();
      const unsubscribe = router.usePlugin(...factories);

      run(router, unsubscribe);

      expect(logged).toStrictEqual([
        ["error", "router", "Error during cleanup:"],
      ]);

      router.dispose();
    });
  },
);
