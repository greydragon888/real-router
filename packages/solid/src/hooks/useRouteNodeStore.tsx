import { createStoreFromSource } from "../createStoreFromSource";
import { getOrCreateNodeSource } from "./sharedNodeSource";
import { useRouter } from "./useRouter";

import type { RouteState } from "../types";

export function useRouteNodeStore(nodeName: string): RouteState {
  const router = useRouter();

  return createStoreFromSource(getOrCreateNodeSource(router, nodeName));
}
