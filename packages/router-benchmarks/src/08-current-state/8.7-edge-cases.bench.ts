// packages/router-benchmarks/modules/08-current-state/8.7-edge-cases.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter } from "../helpers";

// 8.7.1 State with large number of parameters
{
  const router = createSimpleRouter();
  const params: Record<string, string> = {};

  for (let i = 0; i < 100; i++) {
    params[`param${i}`] = `value${i}`;
  }

  bench("8.7.1 State with large number of parameters", () => {
    for (let i = 0; i < 100; i++) {
      do_not_optimize(router.makeState("home", params, "/"));
    }
  }).gc("inner");
}

// 8.7.4 Comparing states with identical parameters but different structure
{
  const router = createSimpleRouter();
  const state1 = router.makeState("home", { a: "1", b: "2" }, "/");
  const state2 = router.makeState("home", { b: "2", a: "1" }, "/");

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

  bench("8.7.6 Building state for non-existent route", () => {
    for (let i = 0; i < 100; i++) {
      do_not_optimize(router.buildState("nonexistent", {}));
    }
  }).gc("inner");
}

// 8.7.9 Sequential state ID generation
{
  const router = createSimpleRouter();

  bench("8.7.9 Sequential state ID generation", () => {
    for (let i = 0; i < 10; i++) {
      do_not_optimize(router.makeState("about", {}, "/about"));
    }
  }).gc("inner");
}

// 8.7.10 Comparing states with null parameters
{
  const router = createSimpleRouter();
  const state1 = router.makeState("home", { value: null }, "/");
  const state2 = router.makeState("home", { value: undefined }, "/");

  bench("8.7.10 Comparing states with null parameters", () => {
    for (let i = 0; i < 100; i++) {
      do_not_optimize(router.areStatesEqual(state1, state2));
    }
  }).gc("inner");
}
