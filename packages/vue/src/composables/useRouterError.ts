import { getErrorSource } from "@real-router/sources";

import { useRefFromSource } from "../useRefFromSource";
import { useRouter } from "./useRouter";

import type { RouterErrorSnapshot } from "@real-router/sources";
import type { ShallowRef } from "vue";

export function useRouterError(): ShallowRef<RouterErrorSnapshot> {
  const router = useRouter();
  const source = getErrorSource(router);

  return useRefFromSource(source);
}
