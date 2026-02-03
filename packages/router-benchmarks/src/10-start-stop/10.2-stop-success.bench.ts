// packages/router-benchmarks/modules/10-start-stop/10.2-stop-success.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

/**
 * Batch size for stable measurements.
 * Testing showed batch=10 gives optimal variance (~1.6x) for start/stop operations.
 */
const BATCH = 10;

// 10.2.1 Stopping router via stop
{
  const router = createSimpleRouter();

  bench(`10.2.1 Stopping router via stop (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start();
      router.stop();
    }
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

  bench(`10.2.2 Stopping router with plugins (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start();
      router.stop();
    }
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

  bench(`10.2.3 Stopping router with plugin teardown (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start();
      router.stop();
    }
  }).gc("inner");
}

// 10.2.4 Stopping router during navigation
{
  const router = createSimpleRouter();
  const routes = ["about", "home"];
  let index = 0;

  bench(`10.2.4 Stopping router during navigation (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start();
      router.navigate(routes[index++ % 2]);
      router.stop();
    }
  }).gc("inner");
}

// 10.2.5 Stopping router repeatedly
{
  const router = createSimpleRouter();

  bench(`10.2.5 Stopping router repeatedly (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start();
      router.stop();
      router.stop(); // Idempotent
    }
  }).gc("inner");
}
