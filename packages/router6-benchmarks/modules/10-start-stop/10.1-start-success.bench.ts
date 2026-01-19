// packages/router6-benchmarks/modules/10-start-stop/10.1-start-success.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// JIT Warmup: Pre-warm all code paths to avoid cold-start bias in benchmarks
// Without this, the first benchmark would be ~20x slower due to JIT compilation
{
  const warmupRouter = createSimpleRouter();
  const warmupCallback = () => {};
  const warmupState = warmupRouter.makeState("about", {}, "/about");
  const warmupPaths = ["/about", "/", "/nonexistent"];

  for (let i = 0; i < 100; i++) {
    // Warmup: start() without args
    warmupRouter.start();
    warmupRouter.stop();

    // Warmup: start(path)
    warmupRouter.start(warmupPaths[i % 2]);
    warmupRouter.stop();

    // Warmup: start(state)
    warmupRouter.start(warmupState);
    warmupRouter.stop();

    // Warmup: start(callback)
    warmupRouter.start(warmupCallback);
    warmupRouter.stop();

    // Warmup: start(path, callback)
    warmupRouter.start(warmupPaths[i % 2], warmupCallback);
    warmupRouter.stop();

    // Warmup: start(nonexistent path)
    warmupRouter.start(warmupPaths[2]);
    warmupRouter.stop();
  }
}

// 10.1.1 Starting router without parameters
{
  const router = createSimpleRouter();

  bench("10.1.1 Starting router with stop", () => {
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.1.2 Starting router with path
{
  const router = createSimpleRouter();
  const paths = ["/about", "/"];
  let index = 0;

  bench("10.1.2 Starting router with path and stop", () => {
    router.start(paths[index++ % 2]);
    router.stop();
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

  bench("10.1.3 Starting router with state and stop", () => {
    router.start(states[index++ % 2]);
    router.stop();
  }).gc("inner");
}

// 10.1.4 Starting router with callback
{
  const router = createSimpleRouter();
  const callback = () => {
    // Callback executed
  };

  bench("10.1.4 Starting router with callback and stop", () => {
    router.start(callback);
    router.stop();
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

  bench("10.1.5 Starting router with path and callback and stop", () => {
    router.start(paths[index++ % 2], callback);
    router.stop();
  }).gc("inner");
}

// 10.1.6 Starting router to non-existent route with allowNotFound
{
  const router = createSimpleRouter();
  const paths = ["/nonexistent", "/notfound"];
  let index = 0;

  bench("10.1.6 Starting router to non-existent route with stop", () => {
    router.start(paths[index++ % 2]);
    router.stop();
  }).gc("inner");
}

// 10.1.7 Starting router with plugins
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    onStart: () => {
      // Plugin onStart handler
    },
  }));

  bench("10.1.7 Starting router with plugins and stop", () => {
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.1.8 Starting router with middleware
{
  const router = createSimpleRouter();

  router.useMiddleware(() => (_toState, _fromState, done) => {
    done();
  });

  bench("10.1.8 Starting router with middleware and stop", () => {
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.1.9 Starting router with guards
{
  const router = createSimpleRouter();

  router.canActivate("home", () => () => true);

  bench("10.1.9 Starting router with guards and stop", () => {
    router.start();
    router.stop();
  }).gc("inner");
}
