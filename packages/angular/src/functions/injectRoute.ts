import { injectOrThrow } from "./injectOrThrow";
import { ROUTE } from "../providers";

import type { RouteSignals } from "../types";

export function injectRoute(): RouteSignals {
  return injectOrThrow(ROUTE, "injectRoute");
}
