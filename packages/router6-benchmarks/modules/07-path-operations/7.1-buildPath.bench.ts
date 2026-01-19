// packages/router6-benchmarks/modules/07-path-operations/7.1-buildPath.bench.ts

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
    children: [{ name: "profile", path: "/:id/profile" }],
  },
];

// 7.1.1 Building path for simple route
{
  const router = createRouter(routes);

  bench("7.1.1 Building path for simple route", () => {
    do_not_optimize(router.buildPath("about"));
  }).gc("inner");
}

// 7.1.2 Building path with parameters
{
  const router = createRouter(routes);

  bench("7.1.2 Building path with parameters", () => {
    do_not_optimize(router.buildPath("user", { id: "123" }));
  }).gc("inner");
}

// 7.1.3 Building path for nested route
{
  const router = createRouter(routes);

  bench("7.1.3 Building path for nested route", () => {
    do_not_optimize(router.buildPath("users.profile", { id: "123" }));
  }).gc("inner");
}

// 7.1.4 Building path with query parameters
{
  const router = createRouter(routes);

  bench("7.1.4 Building path with query parameters", () => {
    do_not_optimize(router.buildPath("about", { search: "test", page: "1" }));
  }).gc("inner");
}

// 7.1.5 Building path with parameter encoding
{
  const router = createRouter(routes, {
    urlParamsEncoding: "uriComponent",
  });

  bench("7.1.5 Building path with parameter encoding", () => {
    do_not_optimize(router.buildPath("user", { id: "test@example.com" }));
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

  bench("7.1.6 Building path with defaultParams", () => {
    do_not_optimize(router.buildPath("search"));
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

  bench("7.1.7 Building path with custom encoder", () => {
    do_not_optimize(router.buildPath("custom", { id: "123" }));
  }).gc("inner");
}

// 7.1.8 Building path with trailing slash
{
  const router = createRouter(routes, {
    trailingSlash: "always",
  });

  bench("7.1.8 Building path with trailing slash", () => {
    do_not_optimize(router.buildPath("about"));
  }).gc("inner");
}

// 7.1.9 Multiple buildPath calls
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
