// packages/router-benchmarks/modules/05-router-options/5.2-modification.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createRouter } from "../helpers";

import type { Route } from "../helpers";

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
];

// 5.2.1 Batch changing 1000 options (mixed types)
// Combines all setOption scenarios for stable memory measurement
{
  const router = createRouter(routes);

  // Pre-define option setters to reduce cognitive complexity
  const optionSetters = [
    (i: number) =>
      router.setOption("trailingSlash", i % 2 === 0 ? "never" : "always"),
    (i: number) =>
      router.setOption("defaultRoute", i % 2 === 0 ? "home" : "about"),
    (i: number) =>
      router.setOption(
        "defaultParams",
        i % 2 === 0 ? { lang: "en" } : { lang: "ru" },
      ),
    (i: number) =>
      router.setOption(
        "urlParamsEncoding",
        i % 2 === 0 ? "uri" : "uriComponent",
      ),
    (i: number) =>
      router.setOption("queryParamsMode", i % 2 === 0 ? "strict" : "loose"),
    (i: number) => router.setOption("allowNotFound", i % 2 === 0),
    (i: number) => router.setOption("rewritePathOnMatch", i % 2 === 0),
  ];

  bench("5.2.1 Batch changing 1000 options (mixed types)", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(optionSetters[i % 7](i));
    }
  }).gc("inner");
}

// 5.2.2 Batch changing 1000 multiple options sequentially
/*{
  const router = createRouter(routes);

  bench("5.2.2 Batch changing 1000 multiple options sequentially", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(
        router.setOption("trailingSlash", i % 2 === 0 ? "never" : "always"),
      );
      do_not_optimize(router.setOption("allowNotFound", i % 2 === 0));
      do_not_optimize(router.setOption("rewritePathOnMatch", i % 2 === 0));
    }
  }).gc("inner");
}*/

// 5.2.3 Batch getting 1000 current settings
/*{
  const router = createRouter(routes);

  bench("5.2.3 Batch getting 1000 current settings", () => {
    for (let i = 0; i < 1000; i++) {
      do_not_optimize(router.getOptions());
    }
  }).gc("inner");
}*/
