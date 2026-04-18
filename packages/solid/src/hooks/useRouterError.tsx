import { getErrorSource } from "@real-router/sources";

import { createSignalFromSource } from "../createSignalFromSource";
import { useRouter } from "./useRouter";

import type { RouterErrorSnapshot } from "@real-router/sources";
import type { Accessor } from "solid-js";

export function useRouterError(): Accessor<RouterErrorSnapshot> {
  const router = useRouter();
  const source = getErrorSource(router);

  return createSignalFromSource(source);
}
