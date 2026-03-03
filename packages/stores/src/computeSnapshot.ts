import type { RouteNodeSnapshot } from "./types.js";
import type { Router, SubscribeState } from "@real-router/core";

export function computeSnapshot(
  currentSnapshot: RouteNodeSnapshot,
  router: Router,
  nodeName: string,
  next?: SubscribeState,
): RouteNodeSnapshot {
  const currentRoute = next?.route ?? router.getState();
  const previousRoute = next?.previousRoute;

  const isNodeActive =
    nodeName === "" ||
    (currentRoute !== undefined &&
      (currentRoute.name === nodeName ||
        currentRoute.name.startsWith(`${nodeName}.`)));

  const route = isNodeActive ? currentRoute : undefined;

  if (
    route === currentSnapshot.route &&
    previousRoute === currentSnapshot.previousRoute
  ) {
    return currentSnapshot;
  }

  return { route, previousRoute };
}
