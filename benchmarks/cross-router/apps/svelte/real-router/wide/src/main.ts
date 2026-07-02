// real-router wide variant — 1000 flat sibling routes (/catalog/item-1..1000).
// Matcher is a segment trie → match cost should stay ~flat across N. 1000
// distinct static routes are rendered via a single name-parsing branch
// (idiomatic for generated route tables; you don't write 1000 named snippets).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import { wideItems } from "../../../_shared/wide-spec";
import App from "./App.svelte";

import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  ...wideItems.map((n) => ({ name: `item${n}`, path: `/catalog/item-${n}` })),
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
