import type { Navigator, DefaultDependencies, Router } from "./types";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2073). */
const freeze = Object.freeze;

const cache = new WeakMap<Router, Navigator>();

export const getNavigator = <
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  router: Router<Dependencies>,
): Navigator => {
  let nav = cache.get(router);

  if (!nav) {
    nav = freeze({
      navigate: router.navigate,
      getState: router.getState,
      isActiveRoute: router.isActiveRoute,
      canNavigateTo: router.canNavigateTo,
      subscribe: router.subscribe,
      subscribeLeave: router.subscribeLeave,
      isLeaveApproved: router.isLeaveApproved,
    } as Navigator);
    cache.set(router, nav);
  }

  return nav;
};
