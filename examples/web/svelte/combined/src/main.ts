import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { loggerPluginFactory } from "@real-router/logger-plugin";
import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";
import { searchSchemaPlugin } from "@real-router/search-schema-plugin";
import { mount } from "svelte";

import App from "./App.svelte";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { preloadPluginFactory } from "@real-router/preload-plugin";
import { publicRoutes } from "./routes";

import type { AppDependencies } from "./types";
import "../../../../shared/styles.css";

const router = createRouter<AppDependencies>(publicRoutes, {
  defaultRoute: "home",
  allowNotFound: true,
  queryParams: { numberFormat: "auto" },
});

router.usePlugin(
  browserPluginFactory(),
  persistentParamsPluginFactory({ lang: "en" }),
  searchSchemaPlugin({ mode: "development" }),
  loggerPluginFactory(),
  lifecyclePluginFactory(),
  preloadPluginFactory(),
);

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  mount(App, { target: rootElement, props: { router } });
}
