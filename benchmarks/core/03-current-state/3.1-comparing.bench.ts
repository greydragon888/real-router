// benchmarks/core/03-current-state/3.1-comparing.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, IS_REAL_ROUTER, getPluginApi } from "../helpers";

import type { State } from "@real-router/types";

type MakeStateFn = (
  name: string,
  params: Record<string, unknown>,
  path: string,
) => State;

function getMakeState(
  router: ReturnType<typeof createSimpleRouter>,
): MakeStateFn {
  if (IS_REAL_ROUTER) {
    return getPluginApi!(router).makeState as MakeStateFn;
  }

  return (router as unknown as { makeState: MakeStateFn }).makeState.bind(
    router,
  );
}

// 3.1.1 Batch comparing 1000 state pairs (mixed scenarios)
{
  const router = createSimpleRouter();
  const makeState = getMakeState(router);

  // Prepare states for comparison using makeState
  const aboutState = makeState("about", {}, "/about");
  const homeState = makeState("home", {}, "/");
  const user123State = makeState("user", { id: "123" }, "/users/123");
  const user456State = makeState("user", { id: "456" }, "/users/456");

  const comparisons = [
    [aboutState, aboutState], // identical
    [aboutState, homeState], // different names
    [user123State, user456State], // different params
    [homeState, aboutState], // different names (reversed)
  ] as const;

  bench("3.1.1 Batch comparing 100 state pairs (mixed scenarios)", () => {
    for (let i = 0; i < 100; i++) {
      const [s1, s2] = comparisons[i % 4];

      do_not_optimize(router.areStatesEqual(s1, s2));
    }
  }).gc("inner");
}

// 3.1.2 Batch comparing 1000 states with ignoreQueryParams
{
  const router = createSimpleRouter();
  const makeState = getMakeState(router);

  // Prepare states with different query params using makeState
  const state1 = makeState("about", { search: "test" }, "/about?search=test");
  const state2 = makeState("about", { search: "other" }, "/about?search=other");

  bench("3.1.2 Batch comparing 1000 states with ignoreQueryParams", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(router.areStatesEqual(state1, state2, true));
    }
  }).gc("inner");
}
