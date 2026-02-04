// packages/router-benchmarks/modules/09-redirects/9.3-forwardTo.bench.ts

import { bench } from "mitata";

import { createRouter } from "../helpers";

import type { Route } from "../helpers";

// 9.3.1 Automatic forward from forwardTo
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "users", path: "/users" },
    // Two aliases forwarding to different destinations to avoid SAME_STATES
    { name: "alias1", path: "/alias1", forwardTo: "about" },
    { name: "alias2", path: "/alias2", forwardTo: "users" },
  ];
  const router = createRouter(routes);
  const aliases = ["alias1", "alias2"];
  let index = 0;

  router.start();

  bench("9.3.1 Automatic forward from forwardTo", () => {
    router.navigate(aliases[index++ % 2]);
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
  // Alternate IDs to avoid SAME_STATES
  const ids = ["123", "456"];
  let index = 0;

  router.start();

  bench("9.3.2 Forward with parameters", () => {
    router.navigate("profile", { id: ids[index++ % 2] });
  }).gc("inner");
}

// 9.3.3 Chain of forward routes
{
  const routes: Route[] = [
    { name: "home", path: "/" },
    // Two chains ending at different destinations to avoid SAME_STATES
    { name: "final1", path: "/final1" },
    { name: "middle1", path: "/middle1", forwardTo: "final1" },
    { name: "start1", path: "/start1", forwardTo: "middle1" },
    { name: "final2", path: "/final2" },
    { name: "middle2", path: "/middle2", forwardTo: "final2" },
    { name: "start2", path: "/start2", forwardTo: "middle2" },
  ];
  const router = createRouter(routes);
  const starts = ["start1", "start2"];
  let index = 0;

  router.start();

  bench("9.3.3 Chain of forward routes", () => {
    router.navigate(starts[index++ % 2]);
  }).gc("inner");
}
