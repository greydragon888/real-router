import { fc, test } from "@fast-check/vitest";
import { errorCodes, RouterError } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";
import { describe, expect } from "vitest";

import { NUM_RUNS, createPluginRouterWithMock } from "./helpers";

import type { MockNavigation } from "../helpers/mockNavigation";
import type { Router } from "@real-router/core";

/**
 * #2740 class guard: a browser navigation the router refuses leaves every
 * entry where it was and the browser on the entry the navigation started from.
 * A refused push adds its own entry, ahead of that one, and nothing else. One
 * a newer router navigation cancels leaves what that navigation's end decides,
 * whenever it ends (#2802).
 */

/** How a newer navigation that cancels the browser's one ends. */
const ENDINGS = ["refuses", "cancels quietly", "commits"] as const;

type Ending = (typeof ENDINGS)[number];

const PATHS: Readonly<Record<string, string>> = {
  index: "/",
  home: "/home",
  "users.list": "/users/list",
  "users.view": "/users/view/1",
};
const NAMES = Object.keys(PATHS);
const ORIGIN = "http://localhost";

const routeOf = (url: string): string | undefined =>
  NAMES.find((name) => ORIGIN + PATHS[name] === url);

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
};

type Arc = { type: "traverse"; to: number } | { type: "push"; name: string };

const arbArc: fc.Arbitrary<Arc> = fc.oneof(
  fc.record({ type: fc.constant("traverse" as const), to: fc.nat({ max: 9 }) }),
  fc.record({
    type: fc.constant("push" as const),
    name: fc.constantFrom(...NAMES),
  }),
);

/** The route the arc leads to. */
function targetOf(arc: Arc, urls: readonly string[]): string | undefined {
  return arc.type === "push" ? arc.name : routeOf(urls[arc.to % urls.length]);
}

function perform(mock: MockNavigation, arc: Arc): void {
  if (arc.type === "push") {
    mock.navigate(ORIGIN + PATHS[arc.name]);
  } else {
    const entries = mock.entries();

    mock.traverseTo(entries[arc.to % entries.length].key);
  }
}

/** The entries after the refusal: a refused push keeps its own entry ahead. */
function expectedUrls(
  arc: Arc,
  before: readonly string[],
  originIndex: number,
): readonly string[] {
  return arc.type === "push"
    ? [...before.slice(0, originIndex + 1), ORIGIN + PATHS[arc.name]]
    : before;
}

function refuse(
  router: Router,
  guard: "leave" | "enter",
  origin: string,
  target: string,
): void {
  const lifecycle = getLifecycleApi(router);

  if (guard === "leave") {
    lifecycle.addDeactivateGuard(origin, () => () => false);
  } else {
    lifecycle.addActivateGuard(target, () => () => false);
  }
}

/** Holds the arc: the guard never answers it, and allows the others. */
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

const paramsOf = (name: string): Record<string, string> =>
  name === "users.view" ? { id: "1" } : {};

async function walk(
  router: Router,
  mock: MockNavigation,
  journey: readonly string[],
  back: number,
): Promise<void> {
  for (const name of journey) {
    // A repeat of the current route is refused as SAME_STATES, and adds none.
    await router.navigate(name, paramsOf(name)).catch(() => undefined);
  }

  const current = mock.currentEntry?.index ?? 0;
  const origin = Math.max(0, current - back);

  if (origin !== current) {
    mock.traverseTo(mock.entries()[origin].key);
    await settle();
  }
}

describe("refused browser navigation — navigation-plugin (#2740)", () => {
  test.prop(
    [
      fc.array(fc.constantFrom(...NAMES), { minLength: 1, maxLength: 5 }),
      fc.nat({ max: 5 }),
      fc.constantFrom("leave" as const, "enter" as const),
      arbArc,
    ],
    { numRuns: NUM_RUNS.fast },
  )(
    "leaves the entries where they were and the browser on the entry it started from",
    async (journey, back, guard, arc) => {
      const { router, mockNav } = createPluginRouterWithMock();

      await router.start();

      try {
        await walk(router, mockNav, journey, back);

        const origin = router.getState()?.name ?? "";
        const originIndex = mockNav.currentEntry?.index ?? -1;
        const before = mockNav.entries().map((entry) => entry.url);
        const target = targetOf(arc, before) ?? "";

        fc.pre(target !== origin);
        refuse(router, guard, origin, target);

        perform(mockNav, arc);
        await settle();

        expect(mockNav.entries().map((entry) => entry.url)).toStrictEqual(
          expectedUrls(arc, before, originIndex),
        );
        expect(mockNav.currentEntry?.index).toBe(originIndex);
        expect(router.getState()?.name).toBe(origin);
      } finally {
        router.stop();
      }
    },
  );

  test.prop(
    [
      fc.array(fc.constantFrom(...NAMES), { minLength: 1, maxLength: 5 }),
      fc.nat({ max: 5 }),
      fc.constantFrom("leave" as const, "enter" as const),
      arbArc,
      fc.nat({ max: 1 }),
      fc.constantFrom(...ENDINGS),
      fc.boolean(),
    ],
    { numRuns: NUM_RUNS.fast },
  )(
    "one a newer router navigation cancels leaves what that navigation's end decides, whenever it ends (#2802)",
    async (journey, back, guard, arc, pick, ending, later) => {
      const { router, mockNav } = createPluginRouterWithMock();

      await router.start();

      try {
        await walk(router, mockNav, journey, back);

        const origin = router.getState()?.name ?? "";
        const originIndex = mockNav.currentEntry?.index ?? -1;
        const before = mockNav.entries().map((entry) => entry.url);
        const target = targetOf(arc, before) ?? "";

        fc.pre(target !== origin);

        const others = NAMES.filter(
          (name) => name !== origin && name !== target,
        );
        const newer = others[pick % others.length];

        hold(router, guard, origin, target);

        const release = gate(router, newer, ending, later);

        perform(mockNav, arc);
        await settle();
        void router.navigate(newer, paramsOf(newer)).catch(() => undefined);
        await settle();
        release();
        await settle();

        const urls = mockNav.entries().map((entry) => entry.url);

        if (ending === "commits") {
          // It writes after the entry the browser's navigation committed.
          const reached = expectedUrls(arc, before, originIndex).slice(
            0,
            arc.type === "push"
              ? originIndex + 2
              : (arc.to % before.length) + 1,
          );

          expect(urls).toStrictEqual([...reached, ORIGIN + PATHS[newer]]);
          expect(mockNav.currentEntry?.index).toBe(reached.length);
          expect(router.getState()?.name).toBe(newer);
        } else {
          expect(urls).toStrictEqual(expectedUrls(arc, before, originIndex));
          expect(mockNav.currentEntry?.index).toBe(originIndex);
          expect(router.getState()?.name).toBe(origin);
        }
      } finally {
        router.stop();
      }
    },
  );
});
