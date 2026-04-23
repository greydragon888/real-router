import { createRouter } from "@real-router/core";

import { routes } from "./routes";

export function createAppRouter(): ReturnType<typeof createRouter> {
  return createRouter(routes, { defaultRoute: "home", allowNotFound: true });
}
