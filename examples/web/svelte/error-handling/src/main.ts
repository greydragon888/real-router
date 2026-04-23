import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "svelte";

import App from "./App.svelte";
import { errorStore } from "./error-store";
import { routes } from "./routes";

import type { PluginFactory } from "@real-router/core";
import "../../../../shared/styles.css";

const errorLoggerPlugin: PluginFactory = () => ({
  onTransitionError(_toState, _fromState, err) {
    errorStore.add(err);
  },
  onTransitionCancel(toState, fromState) {
    errorStore.addCancel(toState, fromState);
  },
});

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory(), errorLoggerPlugin);

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  mount(App, { target: rootElement, props: { router } });
}
