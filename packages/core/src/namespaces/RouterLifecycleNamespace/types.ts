// packages/core/src/namespaces/RouterLifecycleNamespace/types.ts

import type { DoneFn, State } from "@real-router/types";

export type StartRouterArguments =
  | []
  | [done: DoneFn]
  | [startPathOrState: string | State]
  | [startPathOrState: string | State, done: DoneFn];
