// packages/router-benchmarks/modules/01-navigation-basic/1.1-success.bench.ts

import { bench } from "mitata";

import {
  createRouter,
  createSimpleRouter,
  createNestedRouter,
} from "../helpers";

import type { Route } from "../helpers";

// JIT Warmup: Pre-warm all navigation code paths to avoid cold-start bias
// Without this, the first benchmarks would be significantly slower due to JIT compilation
{
  const warmupRoutes: Route[] = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "user", path: "/user/:id" },
    { name: "search", path: "/search?q&page" },
    {
      name: "complex",
      path: "/complex/:id/:slug?page&sort",
      decodeParams: (params) => params,
      encodeParams: (params) => params,
    },
  ];

  const warmupRouter = createRouter(warmupRoutes, {
    defaultRoute: "home",
    queryParamsMode: "loose",
    urlParamsEncoding: "uriComponent",
  });

  const warmupNested = createNestedRouter(5);

  warmupRouter.start();
  warmupNested.start("/");

  for (let i = 0; i < 100; i++) {
    // Warmup: simple navigation
    warmupRouter.navigate("about");
    warmupRouter.navigate("home");

    // Warmup: navigation with params
    warmupRouter.navigate("user", { id: "123" });

    // Warmup: navigation with query params
    warmupRouter.navigate("search", { q: "test", page: "1" });

    // Warmup: navigation with multiple params
    warmupRouter.navigate("complex", {
      id: "1",
      slug: "test",
      page: "1",
      sort: "asc",
    });

    // Warmup: navigateToDefault
    warmupRouter.navigateToDefault();

    // Warmup: nested routes (full path required for nested routes)
    warmupNested.navigate("root.level1.level2.level3.level4.level5");
    warmupNested.navigate("root");
  }

  warmupRouter.stop();
  warmupNested.stop();
}

// 1.1.1 Simple navigation between routes
{
  const router = createSimpleRouter();
  // Alternate routes to avoid SAME_STATES short-circuit
  const routes = ["home", "about"];
  let index = 0;

  router.start();

  bench("1.1.1 Simple navigation between routes", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 1.1.2 Navigation with route parameters
{
  const router = createSimpleRouter();
  // Alternate IDs to avoid SAME_STATES short-circuit
  const ids = ["123", "456"];
  let index = 0;

  router.start();

  bench("1.1.2 Navigation with route parameters", () => {
    router.navigate("user", { id: ids[index++ % 2] });
  }).gc("inner");
}

// 1.1.3 Navigation through nested routes
// Note: Nested routes require full path (e.g., "root.level1.level2...")
{
  const router = createNestedRouter(5);
  // Alternate between two nested levels to avoid same-state short-circuit
  const routes = [
    "root.level1.level2.level3.level4.level5",
    "root.level1.level2.level3",
  ];
  let index = 0;

  router.start("/");

  bench("1.1.3 Navigation through nested routes", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 1.1.4 Navigation with query parameters
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "search", path: "/search?q&category&page" },
  ];
  const router = createRouter(routes, { queryParamsMode: "loose" });
  // Alternate pages to avoid SAME_STATES short-circuit
  const pages = ["1", "2"];
  let index = 0;

  router.start();

  bench("1.1.4 Navigation with query parameters", () => {
    router.navigate("search", {
      q: "test",
      category: "books",
      page: pages[index++ % 2],
    });
  }).gc("inner");
}

// 1.1.5 Navigation with multiple parameters
{
  const routes: Route[] = [
    {
      name: "complex",
      path: "/complex/:id/:slug/:category?page&sort&limit&offset",
    },
  ];
  const router = createRouter(routes, { queryParamsMode: "loose" });
  // Alternate IDs to avoid SAME_STATES short-circuit
  const ids = ["123", "456"];
  let index = 0;

  router.start();

  bench("1.1.5 Navigation with multiple parameters", () => {
    router.navigate("complex", {
      id: ids[index++ % 2],
      slug: "test-item",
      category: "tech",
      page: "1",
      sort: "desc",
      limit: "20",
      offset: "0",
    });
  }).gc("inner");
}

// 1.1.6 Navigation to default route
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "dashboard", path: "/dashboard" },
  ];
  const router = createRouter(routes, {
    defaultRoute: "dashboard",
    defaultParams: { tab: "overview" },
  });
  // Alternate with home to avoid SAME_STATES short-circuit
  let useDefault = true;

  router.start();

  bench("1.1.6 Navigation to default route", () => {
    if (useDefault) {
      router.navigateToDefault();
    } else {
      router.navigate("home");
    }

    useDefault = !useDefault;
  }).gc("inner");
}

// 1.1.7 Sequential navigation chain
{
  const router = createSimpleRouter();

  router.start();

  // Chain starts from about (not home) to avoid SAME_STATES on first navigate
  bench("1.1.7 Sequential navigation chain", () => {
    router.navigate("about");
    router.navigate("users");
    router.navigate("user", { id: "1" });
    router.navigate("home");
    router.navigate("about");
  }).gc("inner");
}

// 1.1.8 Navigation with parameter encoding
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "item", path: "/item/:name" },
  ];
  const router = createRouter(routes, { urlParamsEncoding: "uriComponent" });
  // Alternate names to avoid SAME_STATES short-circuit
  const names = ["Hello World & Special/Chars", "Another & Item/Name"];
  let index = 0;

  router.start();

  bench("1.1.8 Navigation with parameter encoding (uriComponent)", () => {
    router.navigate("item", { name: names[index++ % 2] });
  }).gc("inner");
}

// 1.1.9 Navigation with parameter decoding
{
  const routes: Route[] = [
    {
      name: "home",
      path: "/",
    },
    {
      name: "user",
      path: "/user/:id",
      decodeParams: (params) => ({
        ...params,
        id: Number.parseInt(params.id as string, 10),
      }),
    },
  ];
  const router = createRouter(routes);
  // Alternate IDs to avoid SAME_STATES short-circuit
  const ids = [123, 456];
  let index = 0;

  router.start();

  bench("1.1.9 Navigation with parameter decoding", () => {
    router.navigate("user", { id: ids[index++ % 2] });
  }).gc("inner");
}

// 1.1.10 Navigation with parameter encoding
{
  const routes: Route[] = [
    {
      name: "home",
      path: "/",
    },
    {
      name: "profile",
      path: "/profile/:userId",
      encodeParams: (params) => ({
        ...params,
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        userId: `user_${String(params.userId)}`,
      }),
    },
  ];
  const router = createRouter(routes);
  // Alternate IDs to avoid SAME_STATES short-circuit
  const userIds = ["123", "456"];
  let index = 0;

  router.start();

  bench("1.1.10 Navigation with parameter encoding", () => {
    router.navigate("profile", { userId: userIds[index++ % 2] });
  }).gc("inner");
}
