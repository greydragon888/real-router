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

  const { route, previousRoute } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot, // SSR: router returns same state on server and client
  );

  const navigator = useMemo(() => getNavigator(router), [router]);

  return useMemo(
    (): RouteContext => ({ navigator, route, previousRoute }),
    [navigator, route, previousRoute],
  );
}
