// packages/router-benchmarks/modules/13-cloning/13.4-configuration.bench.ts

import { getRoutesApi } from "@real-router/core";
import { bench } from "mitata";

import {
  createSimpleRouter,
  cloneRouter,
  IS_ROUTER5,
  addActivateGuard,
  addDeactivateGuard,
} from "../helpers";

import type { Params } from "router5/dist/types/base";

// 13.4.1 Clone preserves defaultParams
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  for (let i = 0; i < 50; i++) {
    // @ts-expect-error - use method from router5
    router.add({
      name: `route${i}`,
      path: `/route${i}`,
      defaultParams: { id: String(i), tab: "default" },
    });
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("route25");
    cloned.stop();
  }

  bench("13.4.1 Clone preserves defaultParams", () => {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("route25");

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
} else {
  const router = createSimpleRouter();
  const routesApi = getRoutesApi(router);

  for (let i = 0; i < 50; i++) {
    routesApi.add({
      name: `route${i}`,
      path: `/route${i}`,
      defaultParams: { id: String(i), tab: "default" },
    });
  }

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("route25");
    cloned.stop();
  }

  bench("13.4.1 Clone preserves defaultParams", () => {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("route25");

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
}

// 13.4.2 Clone preserves decoders/encoders
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  // @ts-expect-error - use method from router5
  router.add({
    name: "custom",
    path: "/custom/:id",
    encodeParams: (params: Params) => ({
      ...params,
      id: `encoded-${params.id as string}`,
    }),
    decodeParams: (params: Params) => ({
      ...params,
      id: (params.id as string).replace("encoded-", ""),
    }),
  });

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("custom", { id: "123" });
    cloned.stop();
  }

  bench("13.4.2 Clone preserves decoders/encoders", () => {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("custom", { id: "123" });

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
} else {
  const router = createSimpleRouter();
  const routesApi = getRoutesApi(router);

  routesApi.add({
    name: "custom",
    path: "/custom/:id",
    encodeParams: (params) => ({
      ...params,
      id: `encoded-${params.id as string}`,
    }),
    decodeParams: (params) => ({
      ...params,
      id: (params.id as string).replace("encoded-", ""),
    }),
  });

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("custom", { id: "123" });
    cloned.stop();
  }

  bench("13.4.2 Clone preserves decoders/encoders", () => {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("custom", { id: "123" });

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
}

// 13.4.3 Clone preserves forwardTo chains
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  // @ts-expect-error - use method from router5
  router.add({ name: "old", path: "/old", forwardTo: "about" });
  // @ts-expect-error - use method from router5
  router.add({ name: "old2", path: "/old2", forwardTo: "old" });

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("old2");
    cloned.stop();
  }

  bench("13.4.3 Clone preserves forwardTo chains", () => {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("old2");

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
} else {
  const router = createSimpleRouter();
  const routesApi = getRoutesApi(router);

  routesApi.add({ name: "old", path: "/old", forwardTo: "about" });
  routesApi.add({ name: "old2", path: "/old2", forwardTo: "old" });

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("old2");
    cloned.stop();
  }

  bench("13.4.3 Clone preserves forwardTo chains", () => {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("old2");

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
}

// 13.4.4 Clone preserves lifecycle handlers
{
  const router = createSimpleRouter();

  addActivateGuard(router, "about", () => () => true);
  addDeactivateGuard(router, "users", () => () => true);

  // JIT warmup for stable memory measurements
  for (let i = 0; i < 100; i++) {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("about");
    cloned.navigate("users");
    cloned.stop();
  }

  bench("13.4.4 Clone preserves lifecycle handlers", () => {
    const cloned = cloneRouter(router);

    cloned.start("/");
    cloned.navigate("about");
    cloned.navigate("users");

    // Fallback: stop started clone
    cloned.stop();
  }).gc("inner");
}
