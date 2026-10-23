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
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

/**
 * The validator's listener-count and async-guard messages name the call that
 * reached them (#2821).
 *
 * Core hands the validator the door for both checks, and several doors reach
 * each, so each door is driven here and read where the consumer reads it: the
 * channel of `logger.callback`.
 */

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "admin", path: "/admin" },
];

type Logged = readonly [level: string, context: string, message: string];

function routerWithLog(limits?: {
  maxListeners: number;
  warnListeners: number;
}): {
  router: Router;
  logged: Logged[];
} {
  const logged: Logged[] = [];
  const router = createRouter(ROUTES, {
    ...(limits === undefined ? {} : { limits }),
    logger: {
      level: "all",
      callback: (level, context, message) => {
        logged.push([level, context, message]);
      },
    },
  });

  router.usePlugin(validationPlugin());

  return { router, logged };
}

/** Calls that hand the validator a listener count for `$$success`. */
const COUNTED_CALLS: readonly {
  door: string;
  register: (router: Router) => void;
}[] = [
  {
    door: "subscribe",
    register: (router) => {
      router.subscribe(() => undefined);
    },
  },
  {
    door: "addEventListener",
    register: (router) => {
      getPluginApi(router).addEventListener(
        events.TRANSITION_SUCCESS,
        () => undefined,
      );
    },
  },
  {
    door: "usePlugin",
    register: (router) => {
      router.usePlugin(() => ({ onTransitionSuccess: () => undefined }));
    },
  },
];

const asyncGuard = () => async (): Promise<boolean> => true;

/**
 * Calls that ask a route's guard synchronously, with the route whose guard they
 * ask. `ask` answers whether the call took the Promise for a refusal.
 */
const ASKING_CALLS: readonly {
  door: string;
  guarded: string;
  ask: (router: Router) => boolean;
}[] = [
  {
    door: "canNavigateTo",
    guarded: "home",
    ask: (router) => {
      getLifecycleApi(router).addDeactivateGuard("home", asyncGuard);

      return !router.canNavigateTo("admin");
    },
  },
  {
    door: "navigateToNotFound",
    guarded: "home",
    ask: (router) => {
      getLifecycleApi(router).addDeactivateGuard("home", asyncGuard);

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
    door: "replace",
    guarded: "landing",
    ask: (router) => {
      getRoutesApi(router).replace([
        { name: "landing", path: "/home", canActivate: asyncGuard },
        { name: "admin", path: "/admin" },
      ]);

      return router.getState()?.name === UNKNOWN_ROUTE;
    },
  },
];

describe("the call tables", () => {
  it("CONTROL — no table has shrunk", () => {
    expect(COUNTED_CALLS).toHaveLength(3);
    expect(ASKING_CALLS).toHaveLength(3);
  });
});

describe("a listener-count warning names the registering call", () => {
  it.each(COUNTED_CALLS)("$door names itself", ({ door, register }) => {
    // 20 % of 10 is 2, so the second registration warns. Core's own warning
    // is off, which leaves the validator's as the only log.
    const { router, logged } = routerWithLog({
      maxListeners: 10,
      warnListeners: 0,
    });

    register(router);
    register(router);

    expect(logged).toStrictEqual([
      [
        "warn",
        `router.${door}`,
        expect.stringContaining('2 listeners registered for "$$success"'),
      ],
    ]);

    router.dispose();
  });
});

describe("a listener-count error names the registering call", () => {
  it.each(COUNTED_CALLS)("$door names itself", ({ door, register }) => {
    // 50 % of 10 is 5, so the fifth registration errors after three warnings.
    const { router, logged } = routerWithLog({
      maxListeners: 10,
      warnListeners: 0,
    });

    for (let registered = 0; registered < 5; registered++) {
      register(router);
    }

    expect(logged).toHaveLength(4);
    expect(logged.at(-1)).toStrictEqual([
      "error",
      `router.${door}`,
      '5 listeners registered for "$$success"! This is excessive. Hard limit at 10.',
    ]);

    router.dispose();
  });
});

describe("an async guard asked synchronously names the asking call", () => {
  it.each(ASKING_CALLS)(
    "$door names itself",
    async ({ door, guarded, ask }) => {
      const { router, logged } = routerWithLog();

      await router.start("/home");

      expect(ask(router)).toBe(true);
      expect(logged).toStrictEqual([
        [
          "warn",
          `router.${door}`,
          `Guard for "${guarded}" returned a Promise. Sync check cannot resolve async guards — returning false.`,
        ],
      ]);

      router.dispose();
    },
  );
});
