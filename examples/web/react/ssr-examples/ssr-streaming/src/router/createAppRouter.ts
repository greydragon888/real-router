import { createRouter } from "@real-router/core";

import { routes } from "./routes";

import type { Router } from "@real-router/core";

export function createAppRouter(): Router {
  return createRouter(routes, { defaultRoute: "home", allowNotFound: true });
}
