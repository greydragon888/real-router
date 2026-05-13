import { createRouteNodeSource } from "@real-router/sources";
import { useMemo } from "preact/hooks";

import { useSyncExternalStore } from "../useSyncExternalStore";
import { useNavigator } from "./useNavigator";
import { useRouter } from "./useRouter";

import type { RouteContext } from "../types";

export function useRouteNode(nodeName: string): RouteContext {
  const router = useRouter();
  const navigator = useNavigator();

  const store = useMemo(
    () => createRouteNodeSource(router, nodeName),
    [router, nodeName],
  );

  const { route, previousRoute } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  return useMemo(
    (): RouteContext => ({ navigator, route, previousRoute }),
    [navigator, route, previousRoute],
  );
}
