// packages/router-benchmarks/modules/08-current-state/8.2-comparing.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter } from "../helpers";

// 8.2.1 Batch comparing 1000 state pairs (mixed scenarios)
{
  const router = createSimpleRouter();

  // Prepare states for comparison using makeState
  const aboutState = router.makeState("about", {}, "/about");
  const homeState = router.makeState("home", {}, "/");
  const user123State = router.makeState("user", { id: "123" }, "/users/123");
  const user456State = router.makeState("user", { id: "456" }, "/users/456");

  const comparisons = [
    [aboutState, aboutState], // identical
    [aboutState, homeState], // different names
    [user123State, user456State], // different params
    [homeState, aboutState], // different names (reversed)
  ] as const;

  bench("8.2.1 Batch comparing 100 state pairs (mixed scenarios)", () => {
    for (let i = 0; i < 100; i++) {
      const [s1, s2] = comparisons[i % 4];

      do_not_optimize(router.areStatesEqual(s1, s2));
    }
  }).gc("inner");
}

// 8.2.2 Batch comparing 1000 states with ignoreQueryParams
{
  const router = createSimpleRouter();

  // Prepare states with different query params using makeState
  const state1 = router.makeState(
    "about",
    { search: "test" },
    "/about?search=test",
  );
  const state2 = router.makeState(
    "about",
    { search: "other" },
    "/about?search=other",
  );

  bench("8.2.2 Batch comparing 1000 states with ignoreQueryParams", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(router.areStatesEqual(state1, state2, true));
    }
  }).gc("inner");
}
