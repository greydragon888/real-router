// packages/router-benchmarks/modules/08-current-state/8.5-building.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter } from "../helpers";

// 8.5.1 Building state via buildState
{
  const router = createSimpleRouter();

  bench("8.5.1 Building state via buildState", () => {
    do_not_optimize(router.buildState("about", {}));
  }).gc("inner");
}

// 8.5.2 Building state for nested route
{
  const router = createSimpleRouter();

  bench("8.5.2 Building state for nested route", () => {
    do_not_optimize(router.buildState("user", { id: "123" }));
  }).gc("inner");
}

// 8.5.3 Building state with encoding
{
  const router = createSimpleRouter();

  bench("8.5.3 Building state with encoding", () => {
    do_not_optimize(router.buildState("user", { id: "test@example.com" }));
  }).gc("inner");
}

// 8.5.4 Building state with defaultParams
{
  const router = createSimpleRouter();

  bench("8.5.4 Building state with defaultParams", () => {
    do_not_optimize(router.buildState("home", {}));
  }).gc("inner");
}
