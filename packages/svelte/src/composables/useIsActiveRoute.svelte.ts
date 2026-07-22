import { createActiveSource } from "@real-router/sources";

import { createReactiveSource } from "../createReactiveSource.svelte";
import { useRouter } from "./useRouter.svelte";

import type { Params } from "@real-router/core";

export function useIsActiveRoute(
  routeName: string,
  params: Params | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
  hash?: string,
): { readonly current: boolean } {
  const router = useRouter();

  // The fast/slow decision — and the `routeName !== ""` guard that keeps
  // `useIsActiveRoute("")` in sync with `router.isActiveRoute("")` (a misused
  // empty name matches nothing, #1427) — lives in the shared `createActiveSource`
  // builder (#1099 landed the fast path inline here; #1427 folded it into the
  // shared builder). `createReactiveSource` bridges either path — the selector-
  // backed fast source or the per-link slow source — to Svelte reactivity.
  return createReactiveSource(
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
  );
}
