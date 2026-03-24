import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { loggerPluginFactory } from "@real-router/logger-plugin";
import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";
import { mount } from "svelte";

import App from "./App.svelte";
import { dataLoaderPluginFactory } from "./dataLoader";
import { publicRoutes } from "./routes";

import type { AppDependencies } from "./types";
import "../../../shared/styles.css";

const router = createRouter<AppDependencies>(publicRoutes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(
  browserPluginFactory(),
  persistentParamsPluginFactory({ lang: "en" }),
  loggerPluginFactory(),
  dataLoaderPluginFactory(),
);

await router.start();

const rootElement = document.querySelector("#root");

if (rootElement) {
  mount(App, { target: rootElement, props: { router } });
}
