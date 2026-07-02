// real-router links variant — 100 active-aware <Link activeClassName> to sibling
// /tab/i routes. Each Link subscribes to active state → navigation recomputes
// active across all 100 (cached createActiveRouteSource per Link).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import { tabs } from "../../../_shared/links-spec";
import App from "./App.svelte";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...tabs.map((i) => ({ name: `tab${i}`, path: `/tab/${i}` })),
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
