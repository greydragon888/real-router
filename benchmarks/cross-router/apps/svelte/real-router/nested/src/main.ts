// real-router nested variant — shared SectionLayout (nodeName="sec") with two
// sibling leaves a/b. Switching a<->b keeps SectionLayout mounted (RouteView
// reuses the parent); only the inner segment snippet swaps.
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import App from "./App.svelte";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "sec",
    path: "/sec",
    children: [
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ],
  },
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
