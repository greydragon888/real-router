// packages/real-router-benchmarks/modules/05-router-options/5.3-edge-cases.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createRouter } from "../helpers";

import type { Route } from "../helpers";

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

// 5.3.1 Changing option to same value (short-circuit)
/*{
  const router = createRouter(routes, {
    trailingSlash: "strict",
  });

  bench("5.3.1 Changing option to same value (short-circuit)", () => {
    router.setOption("trailingSlash", "strict");
  }).gc("inner");
}*/

// 5.3.2 Getting options multiple times
{
  const router = createRouter(routes);

  bench("5.3.2 Getting options multiple times", () => {
    for (let i = 0; i < 10; i++) {
      do_not_optimize(router.getOptions());
    }
  }).gc("inner");
}

// 5.3.4 Creating with partial settings
bench("5.3.4 Creating with partial settings", () => {
  createRouter(routes, {
    trailingSlash: "never",
    caseSensitive: true,
  });
}).gc("inner");

// 5.3.5 queryParams option with custom parsers
bench("5.3.5 queryParams option with custom parsers", () => {
  createRouter(routes, {
    queryParams: {
      arrayFormat: "brackets",
      booleanFormat: "string",
      nullFormat: "hidden",
    },
  });
}).gc("inner");

// 5.3.6 Creating with conflicting options
bench("5.3.6 Creating with conflicting options", () => {
  createRouter(routes, {
    allowNotFound: true,
    defaultRoute: "home",
  });
}).gc("inner");

// 5.3.7 Changing option right before start
{
  const router = createRouter(routes);
  const values = ["never", "always"] as const;
  let index = 0;

  bench("5.3.7 Changing option right before start", () => {
    router.setOption("trailingSlash", values[index++ % 2]);
    router.start();
    router.stop();
  }).gc("inner");
}
