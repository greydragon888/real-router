import { getNavigator } from "@real-router/core";
import { createRouteNodeSource } from "@real-router/sources";

import { createReactiveSource } from "../createReactiveSource.svelte";
import { useRouter } from "./useRouter.svelte";

import type { RouteContext } from "../types";

export function useRouteNode(nodeName: string): RouteContext {
  const router = useRouter();
  const navigator = getNavigator(router);

  const source = createRouteNodeSource(router, nodeName);
  const reactive = createReactiveSource(source);

  return {
    navigator,
    get route() {
      return {
        get current() {
          return reactive.current.route;
        },
      };
    },
    get previousRoute() {
      return {
        get current() {
          return reactive.current.previousRoute;
        },
      };
    },
  };
}
