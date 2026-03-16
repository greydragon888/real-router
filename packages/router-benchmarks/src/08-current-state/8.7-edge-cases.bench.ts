// packages/router-benchmarks/modules/08-current-state/8.7-edge-cases.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, IS_REAL_ROUTER, getPluginApi } from "../helpers";

import type { Params, State } from "@real-router/types";

type MakeStateFn = (
  name: string,
  params: Record<string, unknown>,
  path: string,
) => State;

type BuildStateFn = (name: string, params: Params) => State | undefined;

// Resolve makeState/buildState: direct method on router5/router6, via getPluginApi on real-router
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

function getBuildState(
  router: ReturnType<typeof createSimpleRouter>,
): BuildStateFn {
  if (IS_REAL_ROUTER) {
    return getPluginApi!(router).buildState as BuildStateFn;
  }

  return (router as unknown as { buildState: BuildStateFn }).buildState.bind(
    router,
  );
}

// 8.7.1 State with large number of parameters
{
  const router = createSimpleRouter();
  const makeState = getMakeState(router);
  const params: Record<string, string> = {};

  for (let i = 0; i < 100; i++) {
    params[`param${i}`] = `value${i}`;
  }

  bench("8.7.1 State with large number of parameters", () => {
    for (let i = 0; i < 100; i++) {
      do_not_optimize(makeState("home", params, "/"));
    }
  }).gc("inner");
}

// 8.7.4 Comparing states with identical parameters but different structure
{
  const router = createSimpleRouter();
  const makeState = getMakeState(router);
  const state1 = makeState("home", { a: "1", b: "2" }, "/");
  const state2 = makeState("home", { b: "2", a: "1" }, "/");

  bench(
    "8.7.4 Comparing states with identical parameters but different structure",
    () => {
      for (let i = 0; i < 100; i++) {
        do_not_optimize(router.areStatesEqual(state1, state2));
      }
    },
  ).gc("inner");
}

// 8.7.6 Building state for non-existent route
{
  const router = createSimpleRouter();
  const buildState = getBuildState(router);

  bench("8.7.6 Building state for non-existent route", () => {
    for (let i = 0; i < 100; i++) {
      do_not_optimize(buildState("nonexistent", {}));
    }
  }).gc("inner");
}

// 8.7.9 Sequential state ID generation
{
  const router = createSimpleRouter();
  const makeState = getMakeState(router);

  bench("8.7.9 Sequential state ID generation", () => {
    for (let i = 0; i < 10; i++) {
      do_not_optimize(makeState("about", {}, "/about"));
    }
  }).gc("inner");
}

// 8.7.10 Comparing states with null parameters
{
  const router = createSimpleRouter();
  const makeState = getMakeState(router);
  const state1 = makeState("home", { value: null }, "/");
  const state2 = makeState("home", { value: undefined }, "/");

  bench("8.7.10 Comparing states with null parameters", () => {
    for (let i = 0; i < 100; i++) {
      do_not_optimize(router.areStatesEqual(state1, state2));
    }
  }).gc("inner");
}
