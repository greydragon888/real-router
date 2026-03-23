import { getNavigator } from "@real-router/core";
import { createRouteNodeSource } from "@real-router/sources";
import { useMemo } from "preact/hooks";

import { useSyncExternalStore } from "../useSyncExternalStore";
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
    store.getSnapshot,
  );

  const navigator = useMemo(() => getNavigator(router), [router]);

  return useMemo(
    (): RouteContext => ({ navigator, route, previousRoute }),
    [navigator, route, previousRoute],
  );
}
