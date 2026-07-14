// real-router link-build variant — mount 1000 <Link>s on demand; the harness
// measures the ScriptDuration of that mount (= 1000 href builds + Link renders).
// Isolates reverse-matching (buildPath) cost from route construction (done once).
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import App from "./App.svelte";

import type { Route } from "@real-router/core";

const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
const COUNT = _n > 0 ? _n : 1000;
const items: number[] = Array.from({ length: COUNT }, (_, i) => i);

const routes: Route[] = [
  { name: "home", path: "/" },
  ...items.map((i) => ({ name: `r${i}`, path: `/r${i}` })),
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
