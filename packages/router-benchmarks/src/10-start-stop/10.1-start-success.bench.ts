// packages/router-benchmarks/modules/10-start-stop/10.1-start-success.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

/**
 * Batch size for stable measurements.
 * Testing showed batch=10 gives optimal variance (~1.6x) for start/stop operations.
 * batch=50 causes GC pressure (variance 7.7x), batch=1 has measurement noise (12.8x).
 */
const BATCH = 10;

// 10.1.1 Starting router without parameters
{
  const router = createSimpleRouter();

  bench(`10.1.1 Starting router with stop (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start();
      router.stop();
    }
  }).gc("inner");
}

// 10.1.2 Starting router with path
{
  const router = createSimpleRouter();
  const paths = ["/about", "/"];
  let index = 0;

  bench(`10.1.2 Starting router with path and stop (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start(paths[index++ % 2]);
      router.stop();
    }
  }).gc("inner");
}

// 10.1.3 Starting router with state
{
  const router = createSimpleRouter();
  const states = [
    router.makeState("about", {}, "/about"),
    router.makeState("home", {}, "/"),
  ];
  let index = 0;

  bench(`10.1.3 Starting router with state and stop (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start(states[index++ % 2]);
      router.stop();
    }
  }).gc("inner");
}

// 10.1.4 Starting router with callback
{
  const router = createSimpleRouter();
  const callback = () => {
    // Callback executed
  };

  bench(`10.1.4 Starting router with callback and stop (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start(callback);
      router.stop();
    }
  }).gc("inner");
}

// 10.1.5 Starting router with path and callback
{
  const router = createSimpleRouter();
  const paths = ["/about", "/"];
  const callback = () => {
    // Callback executed
  };
  let index = 0;

  bench(
    `10.1.5 Starting router with path and callback and stop (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        router.start(paths[index++ % 2], callback);
        router.stop();
      }
    },
  ).gc("inner");
}

// 10.1.6 Starting router to non-existent route with allowNotFound
{
  const router = createSimpleRouter();
  const paths = ["/nonexistent", "/notfound"];
  let index = 0;

  bench(
    `10.1.6 Starting router to non-existent route with stop (×${BATCH})`,
    () => {
      for (let i = 0; i < BATCH; i++) {
        router.start(paths[index++ % 2]);
        router.stop();
      }
    },
  ).gc("inner");
}

// 10.1.7 Starting router with plugins
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    onStart: () => {
      // Plugin onStart handler
    },
  }));

  bench(`10.1.7 Starting router with plugins and stop (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start();
      router.stop();
    }
  }).gc("inner");
}

// 10.1.8 Starting router with middleware
{
  const router = createSimpleRouter();

  router.useMiddleware(() => (_toState, _fromState, done) => {
    done();
  });

  bench(`10.1.8 Starting router with middleware and stop (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start();
      router.stop();
    }
  }).gc("inner");
}

// 10.1.9 Starting router with guards
{
  const router = createSimpleRouter();

  router.canActivate("home", () => () => true);

  bench(`10.1.9 Starting router with guards and stop (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      router.start();
      router.stop();
    }
  }).gc("inner");
}
