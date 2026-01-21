// packages/router-benchmarks/modules/08-current-state/8.6-forward.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter } from "../helpers";

// 8.6.1 Creating forward state
{
  const router = createSimpleRouter();

  bench("8.6.1 Creating forward state", () => {
    for (let i = 0; i < 100; i++) {
      do_not_optimize(router.forwardState("about", {}));
    }
  }).gc("inner");
}

// 8.6.2 Forward state with parameters
{
  const router = createSimpleRouter();
  const params = { id: "123" };

  bench("8.6.2 Forward state with parameters", () => {
    for (let i = 0; i < 100; i++) {
      do_not_optimize(router.forwardState("user", params));
    }
  }).gc("inner");
}
