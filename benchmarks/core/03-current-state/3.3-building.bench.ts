// benchmarks/core/03-current-state/3.3-building.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, IS_REAL_ROUTER, getPluginApi } from "../helpers";

// Resolve buildState: direct method on router5/router6, via getPluginApi on real-router
function getBuildState(router: ReturnType<typeof createSimpleRouter>) {
  if (IS_REAL_ROUTER) {
    return getPluginApi!(router).buildState;
  }

  return (
    router as unknown as { buildState: (...args: unknown[]) => unknown }
  ).buildState.bind(router);
}

// 3.3.1 Building state via buildState
{
  const router = createSimpleRouter();
  const buildState = getBuildState(router);

  bench("3.3.1 Building state via buildState", () => {
    do_not_optimize(buildState("about", {}));
  }).gc("inner");
}

// 3.3.2 Building state for nested route
{
  const router = createSimpleRouter();
  const buildState = getBuildState(router);

  bench("3.3.2 Building state for nested route", () => {
    do_not_optimize(buildState("user", { id: "123" }));
  }).gc("inner");
}

// 3.3.3 Building state with encoding
{
  const router = createSimpleRouter();
  const buildState = getBuildState(router);

  bench("3.3.3 Building state with encoding", () => {
    do_not_optimize(buildState("user", { id: "test@example.com" }));
  }).gc("inner");
}

// 3.3.4 Building state with defaultParams
{
  const router = createSimpleRouter();
  const buildState = getBuildState(router);

  bench("3.3.4 Building state with defaultParams", () => {
    do_not_optimize(buildState("home", {}));
  }).gc("inner");
}
