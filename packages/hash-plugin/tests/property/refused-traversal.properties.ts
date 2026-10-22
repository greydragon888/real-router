import { fc, test } from "@fast-check/vitest";
import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, expect } from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import { NUM_RUNS } from "./helpers";
import { routerConfig } from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * #2740 class guard: a traversal the router refuses leaves every entry where
 * it was and the browser on the entry the traversal started from — whatever
 * the distance and direction, whichever guard refuses, and whether it refuses
 * or cancels quietly with nothing newer behind it (#2796) — through the
 * popstate/hashchange pair hash-plugin listens to. A traversal a newer
 * navigation cancels leaves what that navigation's end decides, whenever it
 * ends (#2802). It runs on jsdom's own history, which keeps the object a write
 * is given (#2741).
 */

const VERDICTS = [
  "refuses",
  "throws a quiet cancel",
  "rejects with one",
] as const;

type Verdict = (typeof VERDICTS)[number];

/** How a newer navigation that cancels the traversal ends. */
const ENDINGS = [...VERDICTS, "commits"] as const;

type Ending = (typeof ENDINGS)[number];

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

const here = (): string => globalThis.location.hash.slice(1);

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

/** Holds the traversal: the guard never answers it, and allows the others. */
function hold(
  router: Router,
  guard: "leave" | "enter",
  origin: string,
  target: string,
): void {
  const lifecycle = getLifecycleApi(router);
  let first = true;
  const once = () => (): boolean | Promise<boolean> => {
    if (!first) {
      return true;
    }

    first = false;

    return new Promise<boolean>(() => {});
  };

  if (guard === "leave") {
    lifecycle.addDeactivateGuard(origin, once);
  } else {
    lifecycle.addActivateGuard(target, once);
  }
}

/**
 * The guard of the newer navigation: it answers at once, or when the
 * returned function is called.
 */
function gate(
  router: Router,
  route: string,
  ending: Ending,
  later: boolean,
): () => void {
  const decide = (): boolean | Promise<boolean> =>
    ending === "commits" || answer(ending);
  let release = (): void => {};

  getLifecycleApi(router).addActivateGuard(route, () => () => {
    if (!later) {
      return decide();
    }

    return new Promise<boolean>((resolve, reject) => {
      release = () => {
        Promise.resolve().then(decide).then(resolve, reject);
      };
    });
  });

  return () => {
    release();
  };
}

const paramsOf = (name: string): Record<string, string> =>
  name === "users.view" ? { id: "1" } : {};

async function start(
  journey: readonly string[],
  back: number,
): Promise<{ router: Router; paths: string[]; origin: number }> {
  // This run's first entry; earlier runs' entries stay behind it.
  globalThis.history.pushState(null, "", "/#/");

  const router = createRouter(routerConfig, { defaultRoute: "home" });

  router.usePlugin(hashPluginFactory());
  await router.start();

  for (const name of journey) {
    await router.navigate(name, paramsOf(name)).catch(() => undefined);
  }

  const paths = pathsOf(journey);
  const steps = Math.min(back, paths.length - 1);

  if (steps > 0) {
    globalThis.history.go(-steps);
    await settle();
  }

  return { router, paths, origin: paths.length - 1 - steps };
}

describe("refused traversal — hash-plugin (#2740)", () => {
  test.prop(
    [
      fc.array(fc.constantFrom(...NAMES), { minLength: 1, maxLength: 4 }),
      fc.nat({ max: 4 }),
      fc.nat({ max: 4 }),
      fc.constantFrom("leave" as const, "enter" as const),
      fc.constantFrom(...VERDICTS),
    ],
    { numRuns: NUM_RUNS.standard },
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

        expect(here()).toBe(paths[origin]);
        expect(router.getState()?.name).toBe(originRoute);

        // The entry the traversal reached is still the one it was.
        router.stop();
        globalThis.history.go(target - origin);
        await settle();

        expect(here()).toBe(paths[target]);
      } finally {
        router.stop();
      }
    },
  );

  test.prop(
    [
      fc.array(fc.constantFrom(...NAMES), { minLength: 1, maxLength: 4 }),
      fc.nat({ max: 4 }),
      fc.nat({ max: 4 }),
      fc.constantFrom("leave" as const, "enter" as const),
      fc.nat({ max: 1 }),
      fc.constantFrom(...ENDINGS),
      fc.boolean(),
    ],
    { numRuns: NUM_RUNS.standard },
  )(
    "a traversal a newer navigation cancels leaves what that navigation's end decides, whenever it ends (#2802)",
    async (journey, back, to, guard, pick, ending, later) => {
      const { router, paths, origin } = await start(journey, back);

      try {
        const target = to % paths.length;
        const originRoute = routeOf(paths[origin]);
        const targetRoute = routeOf(paths[target]);

        fc.pre(targetRoute !== originRoute);

        const others = NAMES.filter(
          (name) => name !== originRoute && name !== targetRoute,
        );
        const newer = others[pick % others.length];

        hold(router, guard, originRoute, targetRoute);

        const release = gate(router, newer, ending, later);

        globalThis.history.go(target - origin);
        await settle();
        void router.navigate(newer, paramsOf(newer)).catch(() => undefined);
        await settle();
        release();
        await settle();

        if (ending === "commits") {
          // It writes after the entry the traversal reached, which keeps its
          // page.
          expect(here()).toBe(PATHS[newer]);
          expect(router.getState()?.name).toBe(newer);

          router.stop();
          globalThis.history.back();
        } else {
          expect(here()).toBe(paths[origin]);
          expect(router.getState()?.name).toBe(originRoute);

          router.stop();
          globalThis.history.go(target - origin);
        }

        await settle();

        expect(here()).toBe(paths[target]);
      } finally {
        router.stop();
      }
    },
  );
});
