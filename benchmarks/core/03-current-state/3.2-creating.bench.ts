// benchmarks/core/03-current-state/3.2-creating.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, IS_REAL_ROUTER, getPluginApi } from "../helpers";

// Resolve makeState: direct method on router5/router6, via getPluginApi on real-router
function getMakeState(router: ReturnType<typeof createSimpleRouter>) {
  if (IS_REAL_ROUTER) {
    return getPluginApi!(router).makeState;
  }

  return (
    router as unknown as { makeState: (...args: unknown[]) => unknown }
  ).makeState.bind(router);
}

// 3.2.1 Batch creating 1000 basic states
{
  const router = createSimpleRouter();
  const makeState = getMakeState(router);

  bench("3.2.1 Batch creating 1000 basic states", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(makeState("about", {}, "/about"));
    }
  }).gc("inner");
}

// 3.2.2 Batch creating 1000 states with parameters
{
  const router = createSimpleRouter();
  const makeState = getMakeState(router);

  bench("3.2.2 Batch creating 1000 states with parameters", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(makeState("user", { id: String(i) }, `/users/${i}`));
    }
  }).gc("inner");
}

// 3.2.3 Batch creating 1000 states with meta
{
  const router = createSimpleRouter();
  const makeState = getMakeState(router);

  bench("3.2.3 Batch creating 1000 states with meta", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(
        makeState("about", {}, "/about", {
          params: {},
        }),
      );
    }
  }).gc("inner");
}

// 3.2.4 Batch creating 1000 states with meta
{
  const router = createSimpleRouter();
  const makeState = getMakeState(router);

  bench("3.2.4 Batch creating 1000 states with meta", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(makeState("about", {}, "/about", { params: {} }));
    }
  }).gc("inner");
}
