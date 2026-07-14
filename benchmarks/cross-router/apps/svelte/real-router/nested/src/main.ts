// real-router (Svelte) nested variant — shared layout chain of DEPTH D (from `?n=`,
// default 1) with sibling leaves a/b at the bottom. Switching a↔b keeps the whole
// D-deep chain mounted (RouteView reuses every ancestor); only the inner snippet swaps.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import App from "./App.svelte";

import type { Route } from "@real-router/core";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const DEPTH = _n > 0 ? _n : 1;

// Intermediate levels share the route name "nx" (static Svelte snippet name) but
// distinct paths /l{k}; the dotted name sec.nx.nx… is unique per depth.
function buildRoutes(): Route[] {
  const ab: Route[] = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ];
  let node: Route =
    DEPTH === 1
      ? { name: "sec", path: "/sec", children: ab }
      : { name: "nx", path: `/l${DEPTH}`, children: ab };
  for (let k = DEPTH - 1; k >= 2; k--) {
    node = { name: "nx", path: `/l${k}`, children: [node] };
  }
  const sec: Route =
    DEPTH === 1 ? node : { name: "sec", path: "/sec", children: [node] };
  return [{ name: "home", path: "/" }, sec];
}

const router = createRouter(buildRoutes(), {
  defaultRoute: "home",
  allowNotFound: true,
});
router.usePlugin(browserPluginFactory());
await router.start();

const rootElement = document.querySelector("#root");
if (rootElement) {
  mount(App, { target: rootElement, props: { router, depth: DEPTH } });
}
