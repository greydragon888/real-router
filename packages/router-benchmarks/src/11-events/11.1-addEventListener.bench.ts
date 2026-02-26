// packages/router-benchmarks/modules/11-events/11.1-addEventListener.bench.ts

import { bench, do_not_optimize } from "mitata";

import { addEventListener, createSimpleRouter } from "../helpers";

// 11.1.1 Adding $start listener with cleanup
{
  const router = createSimpleRouter();
  const listener = () => {
    // Event handler
  };

  bench("11.1.1 Adding $start listener with cleanup", () => {
    for (let i = 0; i < 100; i++) {
      const unsub = addEventListener(router, "$start", listener);

      do_not_optimize(unsub);
      unsub();
    }
  }).gc("inner");
}

// 11.1.2 Adding $stop listener with cleanup
{
  const router = createSimpleRouter();
  const listener = () => {
    // Event handler
  };

  bench("11.1.2 Adding $stop listener with cleanup", () => {
    for (let i = 0; i < 100; i++) {
      const unsub = addEventListener(router, "$stop", listener);

      do_not_optimize(unsub);
      unsub();
    }
  }).gc("inner");
}

// 11.1.3 Adding $$start listener with cleanup
{
  const router = createSimpleRouter();
  const listener = () => {
    // Event handler
  };

  bench("11.1.3 Adding $$start listener with cleanup", () => {
    for (let i = 0; i < 100; i++) {
      const unsub = addEventListener(router, "$$start", listener);

      do_not_optimize(unsub);
      unsub();
    }
  }).gc("inner");
}

// 11.1.4 Adding $$success listener with cleanup
{
  const router = createSimpleRouter();
  const listener = () => {
    // Event handler
  };

  bench("11.1.4 Adding $$success listener with cleanup", () => {
    for (let i = 0; i < 100; i++) {
      const unsub = addEventListener(router, "$$success", listener);

      do_not_optimize(unsub);
      unsub();
    }
  }).gc("inner");
}

// 11.1.5 Adding $$error listener with cleanup
{
  const router = createSimpleRouter();
  const listener = () => {
    // Event handler
  };

  bench("11.1.5 Adding $$error listener with cleanup", () => {
    for (let i = 0; i < 100; i++) {
      const unsub = addEventListener(router, "$$error", listener);

      do_not_optimize(unsub);
      unsub();
    }
  }).gc("inner");
}

// 11.1.6 Adding $$cancel listener with cleanup
{
  const router = createSimpleRouter();
  const listener = () => {
    // Event handler
  };

  bench("11.1.6 Adding $$cancel listener with cleanup", () => {
    for (let i = 0; i < 100; i++) {
      const unsub = addEventListener(router, "$$cancel", listener);

      do_not_optimize(unsub);
      unsub();
    }
  }).gc("inner");
}

// 11.1.7 Adding multiple listeners for same event with cleanup
{
  const router = createSimpleRouter();

  bench("11.1.7 Adding multiple listeners for same event with cleanup", () => {
    for (let j = 0; j < 10; j++) {
      const unsubscribers: (() => void)[] = [];

      for (let i = 0; i < 10; i++) {
        const unsub = addEventListener(router, "$$success", () => {});

        do_not_optimize(unsub);
        unsubscribers.push(unsub);
      }

      for (const unsub of unsubscribers) {
        unsub();
      }
    }
  }).gc("inner");
}

// 11.1.8 Adding listeners for all events with cleanup
{
  const router = createSimpleRouter();

  bench("11.1.8 Adding listeners for all events with cleanup", () => {
    for (let i = 0; i < 10; i++) {
      const unsub1 = addEventListener(router, "$start", () => {});
      const unsub2 = addEventListener(router, "$stop", () => {});
      const unsub3 = addEventListener(router, "$$start", () => {});
      const unsub4 = addEventListener(router, "$$success", () => {});
      const unsub5 = addEventListener(router, "$$error", () => {});
      const unsub6 = addEventListener(router, "$$cancel", () => {});

      do_not_optimize(unsub1);
      do_not_optimize(unsub2);
      do_not_optimize(unsub3);
      do_not_optimize(unsub4);
      do_not_optimize(unsub5);
      do_not_optimize(unsub6);

      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
    }
  }).gc("inner");
}
