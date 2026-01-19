// packages/router6-benchmarks/modules/11-events/11.1-addEventListener.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter } from "../helpers";

// 11.1.1 Adding $start listener with cleanup
{
  const router = createSimpleRouter();
  const listener = () => {
    // Event handler
  };

  bench("11.1.1 Adding $start listener with cleanup", () => {
    for (let i = 0; i < 100; i++) {
      const unsub = router.addEventListener("$start", listener);

      do_not_optimize(unsub);
      router.removeEventListener("$start", listener);
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
      const unsub = router.addEventListener("$stop", listener);

      do_not_optimize(unsub);
      router.removeEventListener("$stop", listener);
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
      const unsub = router.addEventListener("$$start", listener);

      do_not_optimize(unsub);
      router.removeEventListener("$$start", listener);
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
      const unsub = router.addEventListener("$$success", listener);

      do_not_optimize(unsub);
      router.removeEventListener("$$success", listener);
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
      const unsub = router.addEventListener("$$error", listener);

      do_not_optimize(unsub);
      router.removeEventListener("$$error", listener);
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
      const unsub = router.addEventListener("$$cancel", listener);

      do_not_optimize(unsub);
      router.removeEventListener("$$cancel", listener);
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
        const unsub = router.addEventListener("$$success", () => {});

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
      const unsub1 = router.addEventListener("$start", () => {});
      const unsub2 = router.addEventListener("$stop", () => {});
      const unsub3 = router.addEventListener("$$start", () => {});
      const unsub4 = router.addEventListener("$$success", () => {});
      const unsub5 = router.addEventListener("$$error", () => {});
      const unsub6 = router.addEventListener("$$cancel", () => {});

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
