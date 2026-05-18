import { assertInInjectionContext } from "@angular/core";

import { injectOrThrow } from "./injectOrThrow";
import { NAVIGATOR } from "../providers";

import type { Navigator } from "@real-router/core";

export function injectNavigator(): Navigator {
  assertInInjectionContext(injectNavigator);

  return injectOrThrow(NAVIGATOR, "injectNavigator");
}
