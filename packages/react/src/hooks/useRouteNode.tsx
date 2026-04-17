import { getNavigator } from "@real-router/core";
import { createRouteNodeSource } from "@real-router/sources";
import { useMemo, useSyncExternalStore } from "react";

import { useRouter } from "./useRouter";

import type { RouteContext } from "../types";

export function useRouteNode(nodeName: string): RouteContext {
  const router = useRouter();

  const store = useMemo(
    () => createRouteNodeSource(router, nodeName),
    [router, nodeName],
  );

  // Use snapshot reference directly. createRouteNodeSource via stabilizeState
  // returns the SAME snapshot when the node-relevant state did not change,
  // so memoization on `[navigator, snapshot]` preserves identity for consumers.
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot, // SSR: router returns same state on server and client
  );

  // getNavigator is WeakMap-cached in core; additional useMemo is redundant.
  const navigator = getNavigator(router);

  return useMemo(
    (): RouteContext => ({
      navigator,
      route: snapshot.route,
      previousRoute: snapshot.previousRoute,
    }),
    [navigator, snapshot],
  );
}
