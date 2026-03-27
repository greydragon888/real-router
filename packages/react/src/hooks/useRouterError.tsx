import { createErrorSource } from "@real-router/sources";
import { useMemo, useSyncExternalStore } from "react";

import { useRouter } from "./useRouter";

import type { Router } from "@real-router/core";
import type { RouterErrorSnapshot, RouterSource } from "@real-router/sources";

const cache = new WeakMap<Router, RouterSource<RouterErrorSnapshot>>();

export function useRouterError(): RouterErrorSnapshot {
  const router = useRouter();
  const store = useMemo(() => {
    let source = cache.get(router);

    if (!source) {
      source = createErrorSource(router);
      cache.set(router, source);
    }

    return source;
  }, [router]);

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
