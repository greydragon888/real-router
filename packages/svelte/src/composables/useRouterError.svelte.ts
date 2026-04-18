import { getErrorSource } from "@real-router/sources";

import { createReactiveSource } from "../createReactiveSource.svelte";
import { useRouter } from "./useRouter.svelte";

import type { RouterErrorSnapshot } from "@real-router/sources";

export function useRouterError(): { readonly current: RouterErrorSnapshot } {
  const router = useRouter();
  const source = getErrorSource(router);

  return createReactiveSource(source);
}
