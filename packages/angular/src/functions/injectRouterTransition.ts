import { assertInInjectionContext } from "@angular/core";
import { getTransitionSource } from "@real-router/sources";

import { sourceToSignal } from "../sourceToSignal";
import { injectRouter } from "./injectRouter";

import type { Signal } from "@angular/core";
import type { RouterTransitionSnapshot } from "@real-router/sources";

export function injectRouterTransition(): Signal<RouterTransitionSnapshot> {
  assertInInjectionContext(injectRouterTransition);

  const router = injectRouter();
  const source = getTransitionSource(router);

  return sourceToSignal(source);
}
