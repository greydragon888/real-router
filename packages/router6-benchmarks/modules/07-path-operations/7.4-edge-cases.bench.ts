// packages/real-router-benchmarks/modules/07-path-operations/7.4-edge-cases.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createRouter } from "../helpers";

import type { Route } from "../helpers";

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "user", path: "/users/:id" },
  { name: "article", path: "/articles/:id?/:slug?" },
];

// 7.4.3 Building path with very long parameters
{
  const router = createRouter(routes);
  const longId = "a".repeat(1000);

  bench("7.4.3 Building path with very long parameters", () => {
    do_not_optimize(router.buildPath("user", { id: longId }));
  }).gc("inner");
}

// 7.4.4 Building path with special characters
{
  const router = createRouter(routes);

  bench("7.4.4 Building path with special characters", () => {
    do_not_optimize(
      router.buildPath("user", { id: "test@example.com?foo=bar&baz=qux" }),
    );
  }).gc("inner");
}

// 7.4.5 Matching path with excess segments
{
  const router = createRouter(routes);

  bench("7.4.5 Matching path with excess segments", () => {
    do_not_optimize(router.matchPath("/users/123/extra/segments"));
  }).gc("inner");
}

// 7.4.6 Matching path with incomplete segments
{
  const router = createRouter(routes);

  bench("7.4.6 Matching path with incomplete segments", () => {
    do_not_optimize(router.matchPath("/users"));
  }).gc("inner");
}

// 7.4.7 Building path with array parameters
{
  const router = createRouter(routes);

  bench("7.4.7 Building path with array parameters", () => {
    do_not_optimize(
      router.buildPath("home", { tags: ["tag1", "tag2", "tag3"] }),
    );
  }).gc("inner");
}

// 7.4.8 Matching path with duplicate query parameters
{
  const router = createRouter(routes);

  bench("7.4.8 Matching path with duplicate query parameters", () => {
    do_not_optimize(router.matchPath("/?tag=1&tag=2&tag=3"));
  }).gc("inner");
}

// 7.4.9 Building path for root route
{
  const router = createRouter(routes);

  bench("7.4.9 Building path for root route", () => {
    do_not_optimize(router.buildPath("home"));
  }).gc("inner");
}

// 7.4.10 Matching root path
{
  const router = createRouter(routes);

  bench("7.4.10 Matching root path", () => {
    do_not_optimize(router.matchPath("/"));
  }).gc("inner");
}

// 7.4.12 Matching path without optional parameters
{
  const router = createRouter(routes);

  bench("7.4.12 Matching path without optional parameters", () => {
    do_not_optimize(router.matchPath("/articles"));
  }).gc("inner");
}

// 7.4.13 Building path with different queryParamsMode modes
{
  const router = createRouter(routes, {
    queryParamsMode: "strict",
  });

  bench("7.4.13 Building path with different queryParamsMode modes", () => {
    do_not_optimize(router.buildPath("home", { page: "1" }));
  }).gc("inner");
}

// 7.4.14 Matching with case-insensitive paths
{
  const router = createRouter(routes, {
    caseSensitive: false,
  });

  bench("7.4.14 Matching with case-insensitive paths", () => {
    do_not_optimize(router.matchPath("/USERS/123"));
  }).gc("inner");
}
