import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import App from "./App.svelte";
import { routes } from "./routes";
import { installViewTransitionPolicy } from "./vt-policy";

import "../../../../../shared/styles.css";
import "./styles/transitions.css";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

installViewTransitionPolicy(router);

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  mount(App, { target: rootElement, props: { router } });
}
