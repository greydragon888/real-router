import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import App from "./App.svelte";
import { routes } from "./routes";

import "../../../../../shared/styles.css";
import "./styles/styles.css";

const router = createRouter(routes);

router.usePlugin(browserPluginFactory());

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  mount(App, { target: rootElement, props: { router } });
}
