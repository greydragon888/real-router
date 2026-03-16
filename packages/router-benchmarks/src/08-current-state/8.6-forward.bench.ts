// packages/router-benchmarks/modules/08-current-state/8.6-forward.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, IS_REAL_ROUTER, getPluginApi } from "../helpers";

// Resolve forwardState: direct method on router5/router6, via getPluginApi on real-router
function getForwardState(router: ReturnType<typeof createSimpleRouter>) {
  if (IS_REAL_ROUTER) {
    return getPluginApi!(router).forwardState;
  }

  return (
    router as unknown as { forwardState: (...args: unknown[]) => unknown }
  ).forwardState.bind(router);
}

// 8.6.1 Creating forward state
{
  const router = createSimpleRouter();
  const forwardState = getForwardState(router);

  bench("8.6.1 Creating forward state", () => {
    for (let i = 0; i < 100; i++) {
      do_not_optimize(forwardState("about", {}));
    }
  }).gc("inner");
}

// 8.6.2 Forward state with parameters
{
  const router = createSimpleRouter();
  const forwardState = getForwardState(router);
  const params = { id: "123" };

  bench("8.6.2 Forward state with parameters", () => {
    for (let i = 0; i < 100; i++) {
      do_not_optimize(forwardState("user", params));
    }
  }).gc("inner");
}
