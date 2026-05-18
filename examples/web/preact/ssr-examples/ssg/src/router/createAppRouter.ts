import { createRouter } from "@real-router/core";

import { routes } from "./routes";

export function createAppRouter(
  deps?: Record<string, unknown>,
): ReturnType<typeof createRouter> {
  return createRouter(
    routes,
    { defaultRoute: "home", allowNotFound: true },
    deps,
  );
}
