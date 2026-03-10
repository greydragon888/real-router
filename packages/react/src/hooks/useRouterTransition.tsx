import { createTransitionSource } from "@real-router/sources";
import { useMemo, useSyncExternalStore } from "react";

import { useRouter } from "./useRouter";

import type { RouterTransitionSnapshot } from "@real-router/sources";

export function useRouterTransition(): RouterTransitionSnapshot {
  const router = useRouter();

  const store = useMemo(() => createTransitionSource(router), [router]);

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
