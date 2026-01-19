// packages/real-router-benchmarks/modules/10-start-stop/10.2-stop-success.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// 10.2.1 Stopping router via stop
{
  const router = createSimpleRouter();

  bench("10.2.1 Stopping router via stop", () => {
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.2.2 Stopping router with plugins
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    onStop: () => {
      // Plugin onStop handler
    },
  }));

  bench("10.2.2 Stopping router with plugins", () => {
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.2.3 Stopping router with plugin teardown
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    teardown: () => {
      // Plugin teardown
    },
  }));

  bench("10.2.3 Stopping router with plugin teardown", () => {
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.2.4 Stopping router during navigation
{
  const router = createSimpleRouter();
  const routes = ["about", "home"];
  let index = 0;

  bench("10.2.4 Stopping router during navigation", () => {
    router.start();
    router.navigate(routes[index++ % 2]);
    router.stop();
  }).gc("inner");
}

// 10.2.5 Stopping router repeatedly
{
  const router = createSimpleRouter();

  bench("10.2.5 Stopping router repeatedly", () => {
    router.start();
    router.stop();
    router.stop(); // Idempotent
  }).gc("inner");
}
