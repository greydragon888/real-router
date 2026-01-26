// packages/router-benchmarks/modules/10-start-stop/10.4-lifecycle-edge-cases.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createRouter, createSimpleRouter, IS_ROUTER5 } from "../helpers";

import type { Route } from "../helpers";

// 10.4.1 Starting immediately after router creation with stop
{
  const router = createSimpleRouter();

  bench("10.4.1 Starting immediately after router creation with stop", () => {
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.4.2 Starting after adding routes with stop
if (IS_ROUTER5) {
  const routes: Route[] = [{ name: "home", path: "/" }];
  const router = createRouter(routes);

  // @ts-expect-error - use method from router5
  router.add({ name: "about", path: "/about" });

  bench("10.4.2 Starting after adding routes with stop", () => {
    router.start();
    router.stop();
  }).gc("inner");
} else {
  const routes: Route[] = [{ name: "home", path: "/" }];
  const router = createRouter(routes);

  router.addRoute({ name: "about", path: "/about" });

  bench("10.4.2 Starting after adding routes with stop", () => {
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.4.3 Starting after registering plugins with stop
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({}));

  bench("10.4.3 Starting after registering plugins with stop", () => {
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.4.4 Stop and restart
{
  const router = createSimpleRouter();

  bench("10.4.4 Stop and restart", () => {
    router.start();
    router.stop();
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.4.5 Multiple start-stop cycles
{
  const router = createSimpleRouter();

  bench("10.4.5 Multiple start-stop cycles", () => {
    for (let i = 0; i < 10; i++) {
      router.start();
      router.stop();
    }
  }).gc("inner");
}

// 10.4.6 Starting with initial navigation to root with stop
{
  const router = createSimpleRouter();

  bench("10.4.6 Starting with initial navigation to root with stop", () => {
    router.start("/");
    router.stop();
  }).gc("inner");
}

// 10.4.7 Stopping with state cleanup
{
  const router = createSimpleRouter();

  bench("10.4.7 Stopping with state cleanup", () => {
    router.start();
    router.navigate("about");
    router.stop();
    do_not_optimize(router.getState()); // Should return undefined
  }).gc("inner");
}

// 10.4.9 Starting with many plugins and stop
{
  const router = createSimpleRouter();

  for (let i = 0; i < 20; i++) {
    router.usePlugin(() => ({
      onStart: () => {
        // Plugin handler
      },
    }));
  }

  bench("10.4.9 Starting with many plugins and stop", () => {
    router.start();
    router.stop();
  }).gc("inner");
}

// 10.4.10 Stopping with many plugins
{
  const router = createSimpleRouter();

  for (let i = 0; i < 20; i++) {
    router.usePlugin(() => ({
      teardown: () => {
        // Plugin teardown
      },
    }));
  }

  bench("10.4.10 Stopping with many plugins", () => {
    router.start();
    router.stop();
  }).gc("inner");
}
