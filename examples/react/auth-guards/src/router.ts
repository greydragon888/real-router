import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";

import { publicRoutes } from "./routes";

import type { AppDependencies } from "./types";

export const router = createRouter<AppDependencies>(publicRoutes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());
