import { getErrorSource } from "@real-router/sources";

import { useSyncExternalStore } from "../useSyncExternalStore";
import { useRouter } from "./useRouter";

import type { RouterErrorSnapshot } from "@real-router/sources";

export function useRouterError(): RouterErrorSnapshot {
  const router = useRouter();
  const store = getErrorSource(router);

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
