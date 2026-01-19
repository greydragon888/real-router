// packages/real-router-benchmarks/modules/05-router-options/5.1-initialization.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createRouter } from "../helpers";

import type { Route } from "../helpers";

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

// 5.1.1 Batch creating 100 routers with default settings
bench("5.1.1 Batch creating 100 routers with default settings", () => {
  for (let i = 0; i < 100; i++) {
    do_not_optimize(createRouter(routes, {}));
  }
}).gc("inner");

// 5.1.2 Batch creating 100 routers with full settings
bench("5.1.2 Batch creating 100 routers with full settings", () => {
  for (let i = 0; i < 100; i++) {
    do_not_optimize(
      createRouter(routes, {
        defaultRoute: "home",
        defaultParams: { lang: "en" },
        trailingSlash: "strict",
        caseSensitive: false,
        urlParamsEncoding: "default",
        queryParamsMode: "loose",
        allowNotFound: false,
        rewritePathOnMatch: true,
        queryParams: {
          arrayFormat: "brackets",
        },
      }),
    );
  }
}).gc("inner");
