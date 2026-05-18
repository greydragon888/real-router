import { createRouteNodeSource } from "@real-router/sources";
import { useMemo } from "preact/hooks";

import { useSyncExternalStore } from "../useSyncExternalStore";
import { useNavigator } from "./useNavigator";
import { useRouter } from "./useRouter";

import type { RouteContext } from "../types";

export function useRouteNode(nodeName: string): RouteContext {
  const router = useRouter();
  const navigator = useNavigator();

  // `createRouteNodeSource` is the cached factory from `@real-router/sources`
  // keyed on (router, nodeName) — identical args return identical refs across
  // renders. No `useMemo` needed.
  const store = createRouteNodeSource(router, nodeName);

  const { route, previousRoute } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  // Public stable-ref contract (locked by `useRouteNode.test.tsx` "should
  // return stable reference when nothing changes"): consecutive renders with
  // identical (navigator, route, previousRoute) return the same RouteContext
  // ref. Drop this `useMemo` and downstream consumers re-render on every
  // parent re-render.
  return useMemo(
    (): RouteContext => ({ navigator, route, previousRoute }),
    [navigator, route, previousRoute],
  );
}
