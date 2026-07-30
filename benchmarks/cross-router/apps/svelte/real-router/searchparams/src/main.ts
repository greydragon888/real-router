// real-router search-param-scaling variant — routes with N *query* params
// (/sN?k1=v1&...&kN=vN). real-router declares query params in the path pattern
// (`?k1&k2&...` via searchDecl); they live in route.search (query channel),
// parsed EAGERLY by the matcher (search-params). The leaf reads EVERY value
// (readSearch → checksum) so the number is honest, not a keys-only skim.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import { SEARCH_COUNTS, searchDecl } from "../../../_shared/search-param-spec";
import App from "./App.svelte";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...SEARCH_COUNTS.map((n) => ({ name: `s${n}`, path: `/s${n}${searchDecl(n)}` })),
];

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});
router.usePlugin(browserPluginFactory());
await router.start();

const rootElement = document.querySelector("#root");
if (rootElement) {
  mount(App, { target: rootElement, props: { router } });
}
