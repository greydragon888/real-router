// packages/router6-benchmarks/modules/11-events/11.3-invokeEventListeners.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// 11.3.1 Invoking $$success listeners
{
  const router = createSimpleRouter();

  router.addEventListener("$$success", () => {});
  router.addEventListener("$$success", () => {});
  router.start();

  bench("11.3.1 Invoking $$success listeners", () => {
    router.navigate("about");
  }).gc("inner");
}

// 11.3.2 Invoking listeners when no subscribers
{
  const router = createSimpleRouter();

  router.start();

  bench("11.3.2 Invoking listeners when no subscribers", () => {
    router.navigate("about");
  }).gc("inner");
}

// 11.3.3 Invoking listeners with state freezing
{
  const router = createSimpleRouter();

  router.addEventListener("$$success", () => {
    // States should be frozen
  });
  router.start();

  bench("11.3.3 Invoking listeners with state freezing", () => {
    router.navigate("about");
  }).gc("inner");
}

// 11.3.4 Invoking multiple listeners for same event
{
  const router = createSimpleRouter();

  for (let i = 0; i < 10; i++) {
    router.addEventListener("$$success", () => {});
  }

  router.start();

  bench("11.3.4 Invoking multiple listeners for same event", () => {
    router.navigate("about");
  }).gc("inner");
}
