// packages/router6-benchmarks/modules/09-redirects/9.3-forwardTo.bench.ts

import { bench } from "mitata";

import { createRouter } from "../helpers";

import type { Route } from "../helpers";

// 9.3.1 Automatic forward from forwardTo
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "alias", path: "/alias", forwardTo: "about" },
  ];
  const router = createRouter(routes);

  router.start();

  bench("9.3.1 Automatic forward from forwardTo", () => {
    router.navigate("alias");
  }).gc("inner");
}

// 9.3.2 Forward with parameters
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "user", path: "/users/:id" },
    { name: "profile", path: "/profile/:id", forwardTo: "user" },
  ];
  const router = createRouter(routes);

  router.start();

  bench("9.3.2 Forward with parameters", () => {
    router.navigate("profile", { id: "123" });
  }).gc("inner");
}

// 9.3.3 Chain of forward routes
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "final", path: "/final" },
    { name: "middle", path: "/middle", forwardTo: "final" },
    { name: "start", path: "/start", forwardTo: "middle" },
  ];
  const router = createRouter(routes);

  router.start();

  bench("9.3.3 Chain of forward routes", () => {
    router.navigate("start");
  }).gc("inner");
}
