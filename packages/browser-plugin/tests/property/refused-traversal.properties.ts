import { fc, test } from "@fast-check/vitest";
import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, expect } from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { NUM_RUNS, ROUTES } from "./helpers";

import type { Router } from "@real-router/core";

/**
 * #2740 class guard: a traversal the router refuses leaves every entry where
 * it was and the browser on the entry the traversal started from — whatever
 * the distance and direction, whichever guard refuses, and whether it refuses
 * or cancels quietly with nothing newer behind it (#2796). It runs on jsdom's
 * own history, which keeps the object a write is given (#2741).
 */

const VERDICTS = [
  "refuses",
  "throws a quiet cancel",
  "rejects with one",
] as const;

type Verdict = (typeof VERDICTS)[number];

function answer(verdict: Verdict): boolean | Promise<boolean> {
  if (verdict === "refuses") {
    return false;
  }

  const cancel = new RouterError(errorCodes.TRANSITION_CANCELLED);

  if (verdict === "throws a quiet cancel") {
    throw cancel;
  }

  return Promise.reject(cancel);
}

const PATHS: Readonly<Record<string, string>> = {
  index: "/",
  home: "/home",
  "users.list": "/users/list",
  "users.view": "/users/view/1",
};
const NAMES = Object.keys(PATHS);

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

/** The paths of the entries a journey leaves, from the first. */
function pathsOf(journey: readonly string[]): string[] {
  const names = ["index"];

  for (const name of journey) {
    // A repeat of the current route is refused as SAME_STATES, and adds none.
    if (name !== names.at(-1)) {
      names.push(name);
    }
  }

  return names.map((name) => PATHS[name]);
}

function routeOf(path: string): string {
  return NAMES.find((name) => PATHS[name] === path) ?? "";
}

function refuse(
  router: Router,
  guard: "leave" | "enter",
  verdict: Verdict,
  origin: string,
  target: string,
): void {
  const lifecycle = getLifecycleApi(router);

  if (guard === "leave") {
    lifecycle.addDeactivateGuard(origin, () => () => answer(verdict));
  } else {
    lifecycle.addActivateGuard(target, () => () => answer(verdict));
  }
}

async function start(
  journey: readonly string[],
  back: number,
): Promise<{ router: Router; paths: string[]; origin: number }> {
  // This run's first entry; earlier runs' entries stay behind it.
  globalThis.history.pushState(null, "", "/");

  const router = createRouter(ROUTES, { defaultRoute: "home" });

  router.usePlugin(browserPluginFactory());
  await router.start();

  for (const name of journey) {
    await router
      .navigate(name, name === "users.view" ? { id: "1" } : {})
      .catch(() => undefined);
  }

  const paths = pathsOf(journey);
  const steps = Math.min(back, paths.length - 1);

  if (steps > 0) {
    globalThis.history.go(-steps);
    await settle();
  }

  return { router, paths, origin: paths.length - 1 - steps };
}

describe("refused traversal — browser-plugin (#2740)", () => {
  test.prop(
    [
      fc.array(fc.constantFrom(...NAMES), { minLength: 1, maxLength: 4 }),
      fc.nat({ max: 4 }),
      fc.nat({ max: 4 }),
      fc.constantFrom("leave" as const, "enter" as const),
      fc.constantFrom(...VERDICTS),
    ],
    { numRuns: NUM_RUNS.fast },
  )(
    "leaves the entries where they were and the browser on the entry it started from",
    async (journey, back, to, guard, verdict) => {
      const { router, paths, origin } = await start(journey, back);

      try {
        const target = to % paths.length;
        const originRoute = routeOf(paths[origin]);
        const targetRoute = routeOf(paths[target]);

        fc.pre(targetRoute !== originRoute);
        refuse(router, guard, verdict, originRoute, targetRoute);

        globalThis.history.go(target - origin);
        await settle();

        expect(globalThis.location.pathname).toBe(paths[origin]);
        expect(router.getState()?.name).toBe(originRoute);

        // The entry the traversal reached is still the one it was.
        router.stop();
        globalThis.history.go(target - origin);
        await settle();

        expect(globalThis.location.pathname).toBe(paths[target]);
      } finally {
        router.stop();
      }
    },
  );
});
