import { getNavigator } from "@real-router/core";
import { createRouteNodeSource } from "@real-router/sources";
import { shallowRef, watch } from "vue";

import { useRefFromSource } from "../useRefFromSource";
import { useRouter } from "./useRouter";

import type { RouteContext } from "../types";
import type { State } from "@real-router/core";

export function useRouteNode(nodeName: string): RouteContext {
  const router = useRouter();

  const source = createRouteNodeSource(router, nodeName);
  const snapshot = useRefFromSource(source);

  const navigator = getNavigator(router);

  const route = shallowRef<State | undefined>(snapshot.value.route);
  const previousRoute = shallowRef<State | undefined>(
    snapshot.value.previousRoute,
  );

  watch(
    snapshot,
    (newSnapshot) => {
      route.value = newSnapshot.route;
      previousRoute.value = newSnapshot.previousRoute;
    },
    { flush: "sync" },
  );

  return {
    navigator,
    route,
    previousRoute,
  };
}
