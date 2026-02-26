// packages/router-benchmarks/modules/11-events/11.3-invokeEventListeners.bench.ts

import { bench } from "mitata";

import { addEventListener, createSimpleRouter } from "../helpers";

// 11.3.1 Invoking $$success listeners
{
  const router = createSimpleRouter();
  const routes = ["about", "home"];
  let index = 0;

  addEventListener(router, "$$success", () => {});
  addEventListener(router, "$$success", () => {});
  router.start("/");

  bench("11.3.1 Invoking $$success listeners", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 11.3.2 Invoking listeners when no subscribers
{
  const router = createSimpleRouter();
  const routes = ["about", "home"];
  let index = 0;

  router.start("/");

  bench("11.3.2 Invoking listeners when no subscribers", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 11.3.3 Invoking listeners with state freezing
{
  const router = createSimpleRouter();
  const routes = ["about", "home"];
  let index = 0;

  addEventListener(router, "$$success", () => {
    // States should be frozen
  });
  router.start("/");

  bench("11.3.3 Invoking listeners with state freezing", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 11.3.4 Invoking multiple listeners for same event
{
  const router = createSimpleRouter();
  const routes = ["about", "home"];
  let index = 0;

  for (let i = 0; i < 10; i++) {
    addEventListener(router, "$$success", () => {});
  }

  router.start("/");

  bench("11.3.4 Invoking multiple listeners for same event", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}
