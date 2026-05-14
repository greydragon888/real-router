import { assertInInjectionContext } from "@angular/core";

import { injectOrThrow } from "./injectOrThrow";
import { ROUTER } from "../providers";

import type { Router } from "@real-router/core";

export function injectRouter(): Router {
  assertInInjectionContext(injectRouter);

  return injectOrThrow(ROUTER, "injectRouter");
}
