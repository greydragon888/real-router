// packages/router6-benchmarks/modules/07-path-operations/7.3-setRootPath.bench.ts

import { bench } from "mitata";

import { createRouter } from "../helpers";

import type { Route } from "../helpers";

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

// 7.3.1 Setting root path
{
  const router = createRouter(routes);
  const paths = ["/app", "/application"];
  let index = 0;

  bench("7.3.1 Setting root path", () => {
    router.setRootPath(paths[index++ % 2]);
  }).gc("inner");
}

// 7.3.2 Setting root path with nesting
{
  const router = createRouter(routes);
  const paths = ["/app/v1/api", "/app/v2/api"];
  let index = 0;

  bench("7.3.2 Setting root path with nesting", () => {
    router.setRootPath(paths[index++ % 2]);
  }).gc("inner");
}

// 7.3.3 Changing root path
{
  const router = createRouter(routes);
  const paths = ["/app", "/new-app"];
  let index = 0;

  router.setRootPath("/initial");

  bench("7.3.3 Changing root path", () => {
    router.setRootPath(paths[index++ % 2]);
  }).gc("inner");
}

// 7.3.4 Building paths after setRootPath
{
  const router = createRouter(routes);

  router.setRootPath("/app");

  bench("7.3.4 Building paths after setRootPath", () => {
    router.buildPath("about");
  }).gc("inner");
}

// 7.3.5 Matching paths after setRootPath
{
  const router = createRouter(routes);

  router.setRootPath("/app");

  bench("7.3.5 Matching paths after setRootPath", () => {
    router.matchPath("/app/about");
  }).gc("inner");
}
