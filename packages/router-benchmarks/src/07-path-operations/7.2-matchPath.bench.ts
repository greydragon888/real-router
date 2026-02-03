// packages/router-benchmarks/modules/07-path-operations/7.2-matchPath.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createRouter } from "../helpers";

import type { Route } from "../helpers";

/**
 * Batch size for stable measurements.
 * matchPath is slower than buildPath, so smaller batch is sufficient.
 */
const BATCH = 50;

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
  {
    name: "users",
    path: "/users",
    // real-router: allows any child name (user.profile works even though parent is "users")
    // router5: requires relative child names ("profile"), automatically builds full name "users.profile"
    children: [
      {
        name: "profile",
        path: "/:id/profile",
      },
    ],
  },
];

// 7.2.1 Matching simple path
{
  const router = createRouter(routes);

  bench(`7.2.1 Matching simple path (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.matchPath("/about"));
    }
  }).gc("inner");
}

// 7.2.2 Matching path with parameters
{
  const router = createRouter(routes);

  bench(`7.2.2 Matching path with parameters (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.matchPath("/users/123"));
    }
  }).gc("inner");
}

// 7.2.3 Matching path with query parameters
{
  const router = createRouter(routes);

  bench(`7.2.3 Matching path with query parameters (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.matchPath("/about?search=test&page=1"));
    }
  }).gc("inner");
}

// 7.2.4 Matching nested path
{
  const router = createRouter(routes);

  bench(`7.2.4 Matching nested path (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.matchPath("/users/123/profile"));
    }
  }).gc("inner");
}

// 7.2.5 Matching with parameter decoding
{
  const router = createRouter(routes, {
    urlParamsEncoding: "uriComponent",
  });

  bench(`7.2.5 Matching with parameter decoding (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.matchPath("/users/test%40example.com"));
    }
  }).gc("inner");
}

// 7.2.6 Matching with custom decoder
{
  const router = createRouter([
    {
      name: "custom",
      path: "/custom/:id",
      decodeParams: (params) => params,
    },
  ]);

  bench(`7.2.6 Matching with custom decoder (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.matchPath("/custom/123"));
    }
  }).gc("inner");
}

// 7.2.7 Matching with allowNotFound mode
{
  const router = createRouter(routes, {
    allowNotFound: true,
  });

  bench(`7.2.7 Matching with allowNotFound mode (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.matchPath("/nonexistent"));
    }
  }).gc("inner");
}

// 7.2.8 Matching with source parameter
{
  const router = createRouter(routes);

  bench(`7.2.8 Matching with source parameter (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.matchPath("/users", "users"));
    }
  }).gc("inner");
}

// 7.2.9 Matching with trailing slash
{
  const router = createRouter(routes, {
    trailingSlash: "always",
  });

  bench(`7.2.9 Matching with trailing slash (×${BATCH})`, () => {
    for (let i = 0; i < BATCH; i++) {
      do_not_optimize(router.matchPath("/about/"));
    }
  }).gc("inner");
}
