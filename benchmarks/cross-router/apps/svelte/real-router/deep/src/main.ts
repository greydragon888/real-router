// real-router deep variant — nested route tree (children) to depth DEEP_DEPTH,
// rendered with recursive nested <RouteView>: `self` snippet = leaf when this
// level is terminal, dynamic `l{k+1}` segment snippet = go deeper.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import { DEEP_DEPTH } from "../../../_shared/deep-spec";
import App from "./App.svelte";

import type { Route } from "@real-router/core";

function buildRoute(k: number): Route {
  return {
    name: `l${k}`,
    path: `/l${k}`,
    children: k < DEEP_DEPTH ? [buildRoute(k + 1)] : [],
  };
}

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "deep", path: "/deep", children: [buildRoute(1)] },
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
