import { createRouteNodeSource } from "@real-router/sources";

import { createStoreFromSource } from "../createStoreFromSource";
import { useRouter } from "./useRouter";

import type { RouteState } from "../types";

export function useRouteNodeStore(nodeName: string): RouteState {
  const router = useRouter();

  return createStoreFromSource(createRouteNodeSource(router, nodeName));
}
