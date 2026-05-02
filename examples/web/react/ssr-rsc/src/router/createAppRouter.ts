import { createRouter } from "@real-router/core";

import type { Db } from "../db";
import { routes } from "../routes";

export interface AppDependencies {
  db: Db;
}

export function createAppRouter(deps?: AppDependencies) {
  return createRouter<AppDependencies>(
    routes,
    { defaultRoute: "home", allowNotFound: true },
    deps,
  );
}
