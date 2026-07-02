// real-router params variant — routes with 1/10/100 path params (/pN/:k1/../:kN).
// The matcher (segment trie) collects params during the walk; the leaf reports
// how many it extracted (data-count) so the driver can confirm arrival.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import { PARAM_COUNTS, paramPattern } from "../../../_shared/param-spec";
import App from "./App.svelte";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...PARAM_COUNTS.map((n) => ({ name: `p${n}`, path: paramPattern(n, ":") })),
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
