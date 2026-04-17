import { getNavigator } from "@real-router/core";
import { createRouteNodeSource } from "@real-router/sources";
import { computed } from "vue";

import { useRefFromSource } from "../useRefFromSource";
import { useRouter } from "./useRouter";

import type { RouteContext } from "../types";

export function useRouteNode(nodeName: string): RouteContext {
  const router = useRouter();

  const source = createRouteNodeSource(router, nodeName);
  const snapshot = useRefFromSource(source);

  // getNavigator is WeakMap-cached in core; no useMemo equivalent needed.
  const navigator = getNavigator(router);

  // Derive route/previousRoute via computed instead of mirroring with a sync
  // watch into two extra shallowRefs. computed shares snapshot's identity so
  // when the underlying source emits the same reference (idempotent or
  // out-of-node nav), consumers don't see a new ref.
  const route = computed(() => snapshot.value.route);
  const previousRoute = computed(() => snapshot.value.previousRoute);

  return {
    navigator,
    route,
    previousRoute,
  };
}
