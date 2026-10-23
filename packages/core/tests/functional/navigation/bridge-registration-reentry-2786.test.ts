import { describe, expect, it } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";

import type { Route, Router } from "@real-router/core";

/**
 * A bridge whose registration closed its own scope is closed when the
 * registration returns (#2786).
 *
 * `signal.addEventListener` is a call on the caller's object, and the closer
 * exists only once it returns (#1724). A navigation started inside that call
 * cancels the navigation being bridged before there is a closer to run, so the
 * listener stayed on the caller's signal: its late `abort()` cancelled whichever
 * navigation the router carried by then.
 *
 * ⚠ **Counted, not traced.** The bridged navigation rejects the same way on
 * both sides of the fix; what discriminates is the balance on the caller's
 * signal and the fate of a later navigation when that signal aborts.
 */

type Reentry = "navigate" | "stop";

type Moment = "early" | "late";

interface Cell {
  readonly name: string;
  readonly reentry: Reentry;
  readonly moment: Moment;
}

const CELLS: readonly Cell[] = [
  {
    name: "a navigation started by the early registration",
    reentry: "navigate",
    moment: "early",
  },
  {
    name: "a stop() called by the early registration",
    reentry: "stop",
    moment: "early",
  },
  {
    name: "a navigation started by the late registration",
    reentry: "navigate",
    moment: "late",
  },
];

const CONTROL_MOMENTS: readonly Moment[] = ["early", "late"];

const codeOf = (error: unknown): unknown =>
  (error as { code?: unknown }).code ?? (error as Error).message;

const settle = (promise: Promise<{ name: string }>): Promise<unknown> =>
  promise.then((state) => `resolved:${state.name}`, codeOf);

interface Run {
  readonly first: unknown;
  readonly added: number;
  readonly removed: number;
  readonly later: unknown;
}

/**
 * `a` is bridged onto the caller's signal: EARLY when a pre-commit listener
 * makes the announce open the scope, LATE when only `a`'s guard can abort it.
 * Then `later` waits on an async guard while the caller aborts that signal.
 */
async function run(reentry: Reentry | undefined, moment: Moment): Promise<Run> {
  const routes: Route[] = [
    { name: "home", path: "/" },
    moment === "late"
      ? { name: "a", path: "/a", canActivate: () => () => true }
      : { name: "a", path: "/a" },
    { name: "b", path: "/b" },
    {
      name: "later",
      path: "/later",
      canActivate: () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 20);
        }),
    },
  ];
  const router: Router = createRouter(routes);

  await router.start("/");

  if (moment === "early") {
    router.usePlugin(() => ({ onTransitionStart: () => undefined }));
  }

  const controller = new AbortController();
  const { signal } = controller;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  let added = 0;
  let removed = 0;

  signal.addEventListener = ((
    ...args: Parameters<AbortSignal["addEventListener"]>
  ): void => {
    added += 1;

    if (reentry === "navigate") {
      router.navigate("b").catch(() => undefined);
    } else if (reentry === "stop") {
      router.stop();
    }

    add(...args);
  }) as typeof signal.addEventListener;
  signal.removeEventListener = ((
    ...args: Parameters<AbortSignal["removeEventListener"]>
  ): void => {
    removed += 1;
    remove(...args);
  }) as typeof signal.removeEventListener;

  const first = await settle(router.navigate("a", {}, {}, { signal }));

  if (!router.isActive()) {
    await router.start("/");
  }

  const later = settle(router.navigate("later"));

  controller.abort();

  const result: Run = { first, added, removed, later: await later };

  router.dispose();

  return result;
}

describe("a bridge registration that closes its own scope (#2786)", () => {
  it("the cell tables hold each cell once", () => {
    expect(CELLS).toHaveLength(new Set(CELLS.map((cell) => cell.name)).size);
    expect(CONTROL_MOMENTS).toHaveLength(new Set(CONTROL_MOMENTS).size);
    expect(CELLS.length + CONTROL_MOMENTS.length).toBe(5);
  });

  it.each(CELLS)(
    "$name: the bridge is closed, and the caller's late abort reaches nothing",
    async ({ reentry, moment }) => {
      const result = await run(reentry, moment);

      expect(result.first).toBe(errorCodes.TRANSITION_CANCELLED);
      expect(result.added).toBe(1);
      expect(result.removed).toBe(1);
      expect(result.later).toBe("resolved:later");
    },
  );

  it.each(CONTROL_MOMENTS)(
    "CONTROL, %s: a registration that starts nothing — the bridge closes with its navigation",
    async (moment) => {
      const result = await run(undefined, moment);

      expect(result.first).toBe("resolved:a");
      expect(result.added).toBe(1);
      expect(result.removed).toBe(1);
      expect(result.later).toBe("resolved:later");
    },
  );
});
