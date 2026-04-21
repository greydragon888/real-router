import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { NavigatorContext, RouteContext, RouterContext } from "./context";
import { createRouteAnnouncer, createScrollRestoration } from "./dom-utils";

import type { ScrollRestorationOptions } from "./dom-utils";
import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

export interface RouteProviderProps {
  router: Router;
  children: ReactNode;
  announceNavigation?: boolean;
  scrollRestoration?: ScrollRestorationOptions;
}

export const RouterProvider: FC<RouteProviderProps> = ({
  router,
  children,
  announceNavigation,
  scrollRestoration,
}) => {
  useEffect(() => {
    if (!announceNavigation) {
      return;
    }

    const announcer = createRouteAnnouncer(router);

    return () => {
      announcer.destroy();
    };
  }, [announceNavigation, router]);

  // Primitive deps so inline `{ mode: "restore" }` doesn't thrash on every
  // render. scrollContainer is a getter invoked lazily on every event inside
  // the utility — swapping its reference doesn't change the resolved element,
  // so we intentionally omit it from deps to keep inline getters stable.
  const srMode = scrollRestoration?.mode;
  const srAnchor = scrollRestoration?.anchorScrolling;
  const srEnabled = scrollRestoration !== undefined;

  useEffect(() => {
    if (!srEnabled) {
      return;
    }

    const sr = createScrollRestoration(router, {
      mode: srMode,
      anchorScrolling: srAnchor,
      // srEnabled check above guarantees scrollRestoration is defined.
      scrollContainer: scrollRestoration.scrollContainer,
    });

    return () => {
      sr.destroy();
    };
    // scrollRestoration (for scrollContainer) omitted — see comment above.
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, [router, srEnabled, srMode, srAnchor]);

  const navigator = useMemo(() => getNavigator(router), [router]);

  // useSyncExternalStore manages the router subscription lifecycle:
  // subscribe connects to router on first listener, unsubscribes on last.
  // This is Strict Mode safe — no useEffect cleanup needed.
  const store = useMemo(() => createRouteSource(router), [router]);
  // Use snapshot reference directly. createRouteSource via stabilizeState
  // returns the SAME snapshot reference when route.path is unchanged, so
  // useMemo below sees stable deps for idempotent navigations and
  // RouteContext consumers do not re-render.
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot, // SSR: router returns same state on server and client
  );

  const routeContextValue = useMemo(
    () => ({
      navigator,
      route: snapshot.route,
      previousRoute: snapshot.previousRoute,
    }),
    [navigator, snapshot],
  );

  return (
    <RouterContext.Provider value={router}>
      <NavigatorContext.Provider value={navigator}>
        <RouteContext.Provider value={routeContextValue}>
          {children}
        </RouteContext.Provider>
      </NavigatorContext.Provider>
    </RouterContext.Provider>
  );
};
