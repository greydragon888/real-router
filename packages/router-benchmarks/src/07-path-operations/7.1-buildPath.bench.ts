// packages/router-benchmarks/modules/07-path-operations/7.1-buildPath.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createRouter } from "../helpers";

import type { Route } from "../helpers";

/**
 * Batch size for stable measurements.
 * Sub-µs operations need batching because measurement overhead
 * is comparable to the operation itself.
 */
const BATCH = 100;

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id/profile" }],
  },
];

// 7.1.1 Building path for simple route
{
  const router = createRouter(routes);

  bench(`7.1.1 Building path for simple route (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.buildPath("about"));
    }
  }).gc("inner");
}

// 7.1.2 Building path with parameters
{
  const router = createRouter(routes);

  bench(`7.1.2 Building path with parameters (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.buildPath("user", { id: "123" }));
    }
  }).gc("inner");
}

// 7.1.3 Building path for nested route
{
  const router = createRouter(routes);

  bench(`7.1.3 Building path for nested route (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.buildPath("users.profile", { id: "123" }));
    }
  }).gc("inner");
}

// 7.1.4 Building path with query parameters
{
  const router = createRouter(routes);

  // JIT warmup for stable measurements
  for (let i = 0; i < 300; i++) {
    router.buildPath("about", { search: `test${i}`, page: String(i) });
  }

  bench(`7.1.4 Building path with query parameters (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.buildPath("about", { search: "test", page: "1" }));
    }
  }).gc("inner");
}

// 7.1.5 Building path with parameter encoding
{
  const router = createRouter(routes, {
    urlParamsEncoding: "uriComponent",
  });

  bench(`7.1.5 Building path with parameter encoding (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.buildPath("user", { id: "test@example.com" }));
    }
  }).gc("inner");
}

// 7.1.6 Building path with defaultParams
{
  const router = createRouter([
    {
      name: "search",
      path: "/search",
      defaultParams: { query: "", page: "1" },
    },
  ]);

  bench(`7.1.6 Building path with defaultParams (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.buildPath("search"));
    }
  }).gc("inner");
}

// 7.1.7 Building path with custom encoder
{
  const router = createRouter([
    {
      name: "custom",
      path: "/custom/:id",
      encodeParams: (params) => params,
    },
  ]);

  // JIT warmup for stable measurements
  for (let i = 0; i < 1000; i++) {
    router.buildPath("custom", { id: String(i) });
  }

  const BATCH_ENCODER = 500;

  bench(`7.1.7 Building path with custom encoder (×${BATCH_ENCODER})`, () => {
    for (let i = 0; i < BATCH_ENCODER; i++) {
      do_not_optimize(router.buildPath("custom", { id: "123" }));
    }
  }).gc("inner");
}

// 7.1.8 Building path with trailing slash
{
  const router = createRouter(routes, {
    trailingSlash: "always",
  });

  bench(`7.1.8 Building path with trailing slash (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.buildPath("about"));
    }
  }).gc("inner");
}

// 7.1.9 Multiple buildPath calls (already batched - 30 ops per iteration)
{
  const router = createRouter(routes);

  bench("7.1.9 Multiple buildPath calls", () => {
    for (let i = 0; i < 10; i++) {
      do_not_optimize(router.buildPath("home"));
      do_not_optimize(router.buildPath("about"));
      do_not_optimize(router.buildPath("user", { id: String(i) }));
    }
  }).gc("inner");
}
