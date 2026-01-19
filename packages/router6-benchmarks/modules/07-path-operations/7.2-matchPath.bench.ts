// packages/router6-benchmarks/modules/07-path-operations/7.2-matchPath.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createRouter } from "../helpers";

import type { Route } from "../helpers";

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "user", path: "/users/:id" },
  {
    name: "users",
    path: "/users",
    // router6: allows any child name (user.profile works even though parent is "users")
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

  bench("7.2.1 Matching simple path", () => {
    do_not_optimize(router.matchPath("/about"));
  }).gc("inner");
}

// 7.2.2 Matching path with parameters
{
  const router = createRouter(routes);

  bench("7.2.2 Matching path with parameters", () => {
    do_not_optimize(router.matchPath("/users/123"));
  }).gc("inner");
}

// 7.2.3 Matching path with query parameters
{
  const router = createRouter(routes);

  bench("7.2.3 Matching path with query parameters", () => {
    do_not_optimize(router.matchPath("/about?search=test&page=1"));
  }).gc("inner");
}

// 7.2.4 Matching nested path
{
  const router = createRouter(routes);

  bench("7.2.4 Matching nested path", () => {
    do_not_optimize(router.matchPath("/users/123/profile"));
  }).gc("inner");
}

// 7.2.5 Matching with parameter decoding
{
  const router = createRouter(routes, {
    urlParamsEncoding: "uriComponent",
  });

  bench("7.2.5 Matching with parameter decoding", () => {
    do_not_optimize(router.matchPath("/users/test%40example.com"));
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

  bench("7.2.6 Matching with custom decoder", () => {
    do_not_optimize(router.matchPath("/custom/123"));
  }).gc("inner");
}

// 7.2.7 Matching with allowNotFound mode
{
  const router = createRouter(routes, {
    allowNotFound: true,
  });

  bench("7.2.7 Matching with allowNotFound mode", () => {
    do_not_optimize(router.matchPath("/nonexistent"));
  }).gc("inner");
}

// 7.2.8 Matching with source parameter
{
  const router = createRouter(routes);

  bench("7.2.8 Matching with source parameter", () => {
    do_not_optimize(router.matchPath("/users", "users"));
  }).gc("inner");
}

// 7.2.9 Matching with trailing slash
{
  const router = createRouter(routes, {
    trailingSlash: "always",
  });

  bench("7.2.9 Matching with trailing slash", () => {
    do_not_optimize(router.matchPath("/about/"));
  }).gc("inner");
}
