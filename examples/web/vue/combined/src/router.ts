import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { loggerPluginFactory } from "@real-router/logger-plugin";
import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";
import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";
import { preloadPluginFactory } from "@real-router/preload-plugin";
import { publicRoutes } from "./routes";

import type { AppDependencies } from "./types";

export const router = createRouter<AppDependencies>(publicRoutes, {
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
