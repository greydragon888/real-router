import type { Router } from "./Router";
import type { Navigator, DefaultDependencies } from "@real-router/types";

export const getNavigator = <
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  router: Router<Dependencies>,
): Navigator =>
  Object.freeze({
    navigate: router.navigate,
    getState: router.getState,
    isActiveRoute: router.isActiveRoute,
    canNavigateTo: router.canNavigateTo,
    subscribe: router.subscribe,
  });
