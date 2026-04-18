import { getTransitionSource } from "@real-router/sources";

import { useSyncExternalStore } from "../useSyncExternalStore";
import { useRouter } from "./useRouter";

import type { RouterTransitionSnapshot } from "@real-router/sources";

export function useRouterTransition(): RouterTransitionSnapshot {
  const router = useRouter();
  const store = getTransitionSource(router);

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
