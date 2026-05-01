import { createRouter } from "@real-router/core";

import { routes } from "./routes";

export function createAppRouter() {
  return createRouter(routes, {
    defaultRoute: "home",
    allowNotFound: true,
  });
}
