// packages/router-benchmarks/modules/01-navigation-basic/1.2-edge-cases.bench.ts

import { bench } from "mitata";

import { createRouter, createSimpleRouter, IS_ROUTER5 } from "../helpers";

import type { Route } from "../helpers";

// Helper: routes to alternate between to avoid same-state short-circuit
const alternatingRoutes = ["about", "home"];

// 1.2.1 Navigation with empty parameters
// router5: strictly validates required parameters, throws error on {}
// real-router: handles empty parameters more flexibly with query params
if (!IS_ROUTER5) {
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "user", path: "/users?id" },
  ];
  const router = createRouter(routes, { queryParamsMode: "loose" });
  let index = 0;

  router.start("/");

  bench("1.2.1 Navigation with empty parameters", () => {
    // Alternate between user with empty params and home
    if (index++ % 2 === 0) {
      router.navigate("user", {});
    } else {
      router.navigate("home");
    }
  }).gc("inner");
}

// 1.2.2 Navigation with null parameter values
// router5: considers null/undefined as missing parameters, requires all mandatory ones
// real-router: handles 0/false/"" as valid values (null/undefined treated as missing for query params)
if (!IS_ROUTER5) {
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "test", path: "/test?a&b&c&d&e" },
  ];
  const router = createRouter(routes, { queryParamsMode: "loose" });
  let index = 0;

  router.start("/");

  bench("1.2.2 Navigation with null parameter values", () => {
    if (index++ % 2 === 0) {
      router.navigate("test", {
        a: null,
        b: undefined,
        c: 0,
        d: false,
        e: "",
      });
    } else {
      router.navigate("home");
    }
  }).gc("inner");
}

// 1.2.3 Navigation with very long parameters
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "item", path: "/item/:data" },
  ];
  const router = createRouter(routes);
  // Two different long strings to avoid same-state short-circuit
  const longStrings = ["a".repeat(10_000), "b".repeat(10_000)];
  let index = 0;

  router.start("/");

  bench("1.2.3 Navigation with very long parameters", () => {
    router.navigate("item", { data: longStrings[index++ % 2] });
  }).gc("inner");
}

// 1.2.4 Navigation with special characters
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "item", path: "/item/:name" },
  ];
  const router = createRouter(routes, { urlParamsEncoding: "uriComponent" });
  const specialNames = [
    "Hello/World & Special?Chars=Test#Fragment 🚀 Ω ü",
    "Another/Path & Query?Param=Value#Hash 🎉 Σ ö",
  ];
  let index = 0;

  router.start("/");

  bench("1.2.4 Navigation with special characters", () => {
    router.navigate("item", { name: specialNames[index++ % 2] });
  }).gc("inner");
}

// 1.2.5 Navigation with maximum number of parameters
{
  const params: string[] = [];

  for (let i = 0; i < 100; i++) {
    params.push(`p${i}`);
  }

  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "many", path: `/many?${params.join("&")}` },
  ];
  const router = createRouter(routes, { queryParamsMode: "loose" });

  // Two different param sets to avoid same-state short-circuit
  const navParams1: Record<string, string> = {};
  const navParams2: Record<string, string> = {};

  for (let i = 0; i < 100; i++) {
    navParams1[`p${i}`] = `valueA${i}`;
    navParams2[`p${i}`] = `valueB${i}`;
  }

  const paramSets = [navParams1, navParams2];
  let index = 0;

  router.start("/");

  bench("1.2.5 Navigation with maximum number of parameters", () => {
    router.navigate("many", paramSets[index++ % 2]);
  }).gc("inner");
}

// 1.2.6 Navigation to root route
{
  const router = createSimpleRouter();
  let index = 0;

  router.start("/");

  bench("1.2.6 Navigation to root route", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 1.2.7 Navigation with parameters of different types
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "mixed", path: "/mixed?str&num&bool&arr" },
  ];
  const router = createRouter(routes, { queryParamsMode: "loose" });
  const paramSets = [
    { str: "text1", num: 42, bool: true, arr: ["a", "b", "c"] },
    { str: "text2", num: 99, bool: false, arr: ["x", "y", "z"] },
  ];
  let index = 0;

  router.start("/");

  bench("1.2.7 Navigation with parameters of different types", () => {
    router.navigate("mixed", paramSets[index++ % 2]);
  }).gc("inner");
}

// 1.2.9 Fast sequential navigations
// Chain starts from about (not home) to avoid SAME_STATES on first navigate
{
  const router = createSimpleRouter();

  router.start("/");

  bench("1.2.9 Fast sequential navigations", () => {
    router.navigate("about");
    router.navigate("users");
    router.navigate("user", { id: "1" });
    router.navigate("home");
    router.navigate("about");
    router.navigate("users");
  }).gc("inner");
}

// 1.2.10 Navigation with reload flag
// reload=true forces navigation even to same state
{
  const router = createSimpleRouter();
  let index = 0;

  router.start("/");

  bench("1.2.10 Navigation with reload flag", () => {
    router.navigate(alternatingRoutes[index++ % 2], {}, { reload: true });
  }).gc("inner");
}

// 1.2.11 Navigation with force flag
// force=true forces navigation even to same state
{
  const router = createSimpleRouter();
  let index = 0;

  router.start("/");

  bench("1.2.11 Navigation with force flag", () => {
    router.navigate(alternatingRoutes[index++ % 2], {}, { force: true });
  }).gc("inner");
}

// 1.2.13 Navigation with different trailing slash modes
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
  ];
  const router = createRouter(routes, { trailingSlash: "always" });
  let index = 0;

  router.start("/");

  bench("1.2.13 Navigation with trailing slash (always)", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 1.2.14 Navigation with standard route names
if (!IS_ROUTER5) {
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
  ];
  const router = createRouter(routes);
  let index = 0;

  router.start("/");

  bench("1.2.14 Navigation with standard routes", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 1.2.15 Navigation with allowNotFound option
// Note: router5 does not support allowNotFound option
if (!IS_ROUTER5) {
  const router = createSimpleRouter({ allowNotFound: true });
  // Alternate between different non-existent routes to avoid same-state short-circuit
  const nonExistentRoutes = ["nonexistent-route-a", "nonexistent-route-b"];
  let index = 0;

  router.start("/");

  bench("1.2.15 Navigation with allowNotFound option", () => {
    router.navigate(nonExistentRoutes[index++ % 2]);
  }).gc("inner");
}

// 1.2.16 Navigation with replace flag
{
  const router = createSimpleRouter();
  let index = 0;

  router.start("/");

  bench("1.2.16 Navigation with replace flag", () => {
    router.navigate(alternatingRoutes[index++ % 2], {}, { replace: true });
  }).gc("inner");
}

// 1.2.17 Navigation with custom options
{
  const router = createSimpleRouter();
  let index = 0;

  router.start("/");

  bench("1.2.17 Navigation with custom options", () => {
    router.navigate(
      alternatingRoutes[index++ % 2],
      {},
      {
        replace: true,
        reload: true,
        force: true,
      },
    );
  }).gc("inner");
}
