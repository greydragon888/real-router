import { fc, test } from "@fast-check/vitest";
import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, expect } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import { NUM_RUNS } from "./helpers";

import type { Router, State } from "@real-router/core";

/**
 * #2802 class guard: a `back()`, `forward()` or `go()` a newer navigation
 * cancels leaves the stack to that navigation's end, whenever it ends — one
 * that commits applies to the entry the restore moves to (#1234), and one that
 * is refused, or cancelled quietly, leaves the stack on the entry the router
 * shows. `memoryPlugin.properties.ts` runs no guard, so no restore it starts
 * is ever held.
 */

type MemoryRouter = Router & {
  go: (delta: number) => void;
  back: () => void;
  canGoBack: () => boolean;
};

const NAMES = ["home", "about", "users", "settings", "profile"];
const ROUTES = NAMES.map((name) => ({
  name,
  path: name === "home" ? "/" : `/${name}`,
}));

/** How a newer navigation that cancels the restore ends. */
const ENDINGS = ["refuses", "cancels quietly", "commits"] as const;

type Ending = (typeof ENDINGS)[number];

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

/** The routes of the entries a journey leaves, from the first. */
function entriesOf(journey: readonly string[]): string[] {
  const names = ["home"];

  for (const name of journey) {
    // A repeat of the current route is refused as SAME_STATES, and adds none.
    if (name !== names.at(-1)) {
      names.push(name);
    }
  }

  return names;
}

/** Holds the restore: the guard never answers it, and allows the others. */
function hold(
  router: Router,
  guard: "leave" | "enter",
  shown: string,
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
    lifecycle.addDeactivateGuard(shown, once);
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
  const decide = (): boolean => {
    if (ending === "cancels quietly") {
      throw new RouterError(errorCodes.TRANSITION_CANCELLED);
    }

    return ending === "commits";
  };
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

/** The index the router publishes, and the routes of the entries behind it. */
async function walk(
  router: MemoryRouter,
): Promise<{ index: number; behind: string[] }> {
  const memory = (
    router.getState()?.context as State["context"] & {
      memory?: { historyIndex: number };
    }
  ).memory;
  const behind: string[] = [];

  while (router.canGoBack()) {
    router.back();
    await settle();
    behind.push(router.getState()?.name ?? "?");
  }

  return { index: memory?.historyIndex ?? -1, behind };
}

describe("superseded restore — memory-plugin (#2802)", () => {
  test.prop(
    [
      fc.array(fc.constantFrom(...NAMES), { minLength: 1, maxLength: 5 }),
      fc.nat({ max: 5 }),
      fc.nat({ max: 5 }),
      fc.constantFrom("leave" as const, "enter" as const),
      fc.nat({ max: 2 }),
      fc.constantFrom(...ENDINGS),
      fc.boolean(),
    ],
    { numRuns: NUM_RUNS.async },
  )(
    "a restore a newer navigation cancels leaves the stack to that navigation's end, whenever it ends",
    async (journey, back, to, guard, pick, ending, later) => {
      const router = createRouter(ROUTES) as MemoryRouter;

      router.usePlugin(memoryPluginFactory());
      await router.start("/");

      try {
        for (const name of journey) {
          await router.navigate(name).catch(() => undefined);
        }

        const entries = entriesOf(journey);
        const steps = Math.min(back, entries.length - 1);

        if (steps > 0) {
          router.go(-steps);
          await settle();
        }

        const shown = entries.length - 1 - steps;
        const target = to % entries.length;

        fc.pre(entries[target] !== entries[shown]);

        const others = NAMES.filter(
          (name) => name !== entries[shown] && name !== entries[target],
        );
        const newer = others[pick % others.length];

        hold(router, guard, entries[shown], entries[target]);

        const release = gate(router, newer, ending, later);

        router.go(target - shown);
        void router.navigate(newer).catch(() => undefined);
        await settle();
        release();
        await settle();

        const route = router.getState()?.name;
        const lifecycle = getLifecycleApi(router);

        // The walk restores entries of its own.
        lifecycle.removeDeactivateGuard(entries[shown]);
        lifecycle.removeActivateGuard(entries[target]);
        lifecycle.removeActivateGuard(newer);

        expect({ route, ...(await walk(router)) }).toStrictEqual(
          ending === "commits"
            ? {
                route: newer,
                index: target + 1,
                behind: entries.slice(0, target + 1).toReversed(),
              }
            : {
                route: entries[shown],
                index: shown,
                behind: entries.slice(0, shown).toReversed(),
              },
        );
      } finally {
        router.stop();
      }
    },
  );
});
