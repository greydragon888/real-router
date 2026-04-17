import { injectOrThrow } from "./injectOrThrow";
import { NAVIGATOR } from "../providers";

import type { Navigator } from "@real-router/core";

export function injectNavigator(): Navigator {
  return injectOrThrow(NAVIGATOR, "injectNavigator");
}
