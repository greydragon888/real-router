import { describe, expect, it } from "vitest";

import { createRouter, UNKNOWN_ROUTE } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import type { Route, State } from "@real-router/core";

/**
 * `replace()` revalidates the state the router is on when its revalidation
 * window opens, not the one it was on at the entry (#2786).
 *
 * The new batch's guard factories run between the two: `replace()` compiles
 * them before it touches the store (#1193). A navigation started there commits,
 * and a state read at the entry is then stale — the revalidation committed it
 * back over the navigation, with a `TRANSITION_SUCCESS` naming a route the
 * router had already left.
 */

type Cell =
  | "the batch keeps the route the factory navigated to"
  | "the batch drops the route the factory navigated to";

const CELLS: readonly Cell[] = [
  "the batch keeps the route the factory navigated to",
  "the batch drops the route the factory navigated to",
];

interface Run {
  readonly state: string | undefined;
  readonly log: readonly string[];
}

async function replaceWithAFactory(
  keepTarget: boolean,
  navigates: boolean,
): Promise<Run> {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "c", path: "/c" },
  ]);
  const log: string[] = [];

  await router.start("/");

  router.usePlugin(() => ({
    onTransitionSuccess: (toState: State, fromState: State | undefined) =>
      log.push(`SUCCESS ${toState.name}<-${fromState?.name}`),
  }));

  const batch: Route[] = [
    { name: "home", path: "/" },
    {
      name: "g",
      path: "/g",
      canActivate: () => {
        if (navigates) {
          void router.navigate("c");
        }

        return () => true;
      },
    },
  ];

  getRoutesApi(router).replace(
    keepTarget ? [...batch, { name: "c", path: "/c" }] : batch,
  );

  const run: Run = { state: router.getState()?.name, log };

  router.dispose();

  return run;
}

describe("replace() revalidates the state its window opens on (#2786)", () => {
  it("the cell table holds each cell once", () => {
    expect(CELLS).toHaveLength(new Set(CELLS).size);
    expect(CELLS).toHaveLength(2);
  });

  it.each(CELLS)(
    "a guard factory of the batch navigates — %s",
    async (cell) => {
      const keepTarget =
        cell === "the batch keeps the route the factory navigated to";
      const run = await replaceWithAFactory(keepTarget, true);
      const settled = keepTarget ? "c" : UNKNOWN_ROUTE;

      expect(run.state).toBe(settled);
      expect(run.log).toStrictEqual([
        "SUCCESS c<-home",
        `SUCCESS ${settled}<-c`,
      ]);
    },
  );

  it("CONTROL: a factory that navigates nowhere — the entry's state is revalidated", async () => {
    const run = await replaceWithAFactory(true, false);

    expect(run.state).toBe("home");
    expect(run.log).toStrictEqual(["SUCCESS home<-home"]);
  });
});
