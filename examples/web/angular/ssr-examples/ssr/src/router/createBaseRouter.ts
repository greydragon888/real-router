import { createRouter, type Router } from "@real-router/core";

import { routes, type AppDeps } from "./routes";

export function createBaseRouter(): Router<AppDeps> {
  return createRouter<AppDeps>(routes, {
    defaultRoute: "home",
    allowNotFound: true,
  });
}
