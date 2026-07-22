import { createActiveSource } from "@real-router/sources";
import { useMemo } from "preact/hooks";

import { useSyncExternalStore } from "../useSyncExternalStore";
import { useRouter } from "./useRouter";

import type { Params } from "@real-router/core";

export function useIsActiveRoute(
  routeName: string,
  params?: Params,
  strict = false,
  ignoreQueryParams = true,
  hash?: string,
): boolean {
  const router = useRouter();

  // The fast/slow decision — and the `routeName !== ""` guard that keeps
  // `useIsActiveRoute("")` in sync with `router.isActiveRoute("")` (a misused
  // empty name matches nothing, #1427) — lives in the shared `createActiveSource`
  // builder, so every adapter resolves active state identically (#1249 landed the
  // fast path inline here; #1427 folded it into the shared builder). The `useMemo`
  // wrap skips the branch + `canonicalJson(params)` + cache lookup on every render
  // when all deps (including the `params` reference) are stable.
  const store = useMemo(
    () =>
      createActiveSource(
        router,
        routeName,
        params,
        // Query channel (RFC-4 M2, #1548) — no `routeSearch` on this hook yet;
        // `<Link routeSearch>` wires a real value through in a follow-up.
        undefined,
        strict,
        ignoreQueryParams,
        hash,
      ),
    [router, routeName, params, strict, ignoreQueryParams, hash],
  );

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
