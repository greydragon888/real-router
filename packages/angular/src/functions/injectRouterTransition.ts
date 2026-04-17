import { createTransitionSource } from "@real-router/sources";

import { sourceToSignal } from "../sourceToSignal";
import { injectRouter } from "./injectRouter";

import type { Signal } from "@angular/core";
import type { RouterTransitionSnapshot } from "@real-router/sources";

export function injectRouterTransition(): Signal<RouterTransitionSnapshot> {
  const router = injectRouter();
  const source = createTransitionSource(router);

  return sourceToSignal(source);
}
