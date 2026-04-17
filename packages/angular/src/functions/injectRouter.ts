import { injectOrThrow } from "./injectOrThrow";
import { ROUTER } from "../providers";

import type { Router } from "@real-router/core";

export function injectRouter(): Router {
  return injectOrThrow(ROUTER, "injectRouter");
}
