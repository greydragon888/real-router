import { createTransitionSource } from "@real-router/sources";
import { useSyncExternalStore } from "react";

import { useRouter } from "./useRouter";

import type { Router } from "@real-router/core";
import type {
  RouterSource,
  RouterTransitionSnapshot,
} from "@real-router/sources";

const transitionSourceCache = new WeakMap<
  Router,
  RouterSource<RouterTransitionSnapshot>
>();

function getTransitionSource(
  router: Router,
): RouterSource<RouterTransitionSnapshot> {
  let source = transitionSourceCache.get(router);

  if (!source) {
    source = createTransitionSource(router);
    transitionSourceCache.set(router, source);
  }

  return source;
}

export function useRouterTransition(): RouterTransitionSnapshot {
  const router = useRouter();
  const store = getTransitionSource(router);

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
