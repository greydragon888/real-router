import {
  assertInInjectionContext,
  ChangeDetectorRef,
  DestroyRef,
  inject,
} from "@angular/core";
import { getNavigator } from "@real-router/core";
import { createRouteNodeSource } from "@real-router/sources";

import { sourceToSignal } from "../sourceToSignal";
import { injectRouter } from "./injectRouter";

import type { RouteSignals } from "../types";

export function injectRouteNode(nodeName: string): RouteSignals {
  assertInInjectionContext(injectRouteNode);

  const router = injectRouter();
  const navigator = getNavigator(router);
  const source = createRouteNodeSource(router, nodeName);
  const routeState = sourceToSignal(source);

  // #1466: sync-commit node-state displays in the click task — the node source
  // notifies synchronously (outside Angular CD), so a local `detectChanges()`
  // commits the consumer in-task instead of on the deferred zoneless flush.
  // Mirrors `injectRoute`; the `source` teardown is owned by `sourceToSignal`
  // (cached-source `destroy()` is a no-op), so only the extra listener is
  // unsubscribed here. Optional CDR keeps environment-context usage deferred.
  const cdr = inject(ChangeDetectorRef, { optional: true });

  if (cdr) {
    inject(DestroyRef).onDestroy(
      source.subscribe(() => {
        cdr.detectChanges();
      }),
    );
  }

  return { routeState, navigator };
}
