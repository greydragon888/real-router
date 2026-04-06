import { afterAll, beforeAll, bench, describe } from "vitest";

import { setup } from "./setup";

describe("Real-Router client-nav (solid)", () => {
  const test = setup();

  beforeAll(test.before);
  afterAll(test.after);

  bench(
    "client-side navigation loop (solid)",
    async () => {
      for (let i = 0; i < 10; i++) {
        await test.tick();
      }
    },
    {
      warmupIterations: 100,
      time: 10_000,
      setup: test.before,
      teardown: test.after,
    },
  );
});
