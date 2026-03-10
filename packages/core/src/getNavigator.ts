import type {
  Navigator,
  DefaultDependencies,
  Router,
} from "@real-router/types";

const cache = new WeakMap<Router, Navigator>();

export const getNavigator = <
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  router: Router<Dependencies>,
): Navigator => {
  let nav = cache.get(router);

  if (!nav) {
    nav = Object.freeze({
      navigate: router.navigate,
      getState: router.getState,
      isActiveRoute: router.isActiveRoute,
      canNavigateTo: router.canNavigateTo,
      subscribe: router.subscribe,
    });
    cache.set(router, nav);
  }

  return nav;
};
