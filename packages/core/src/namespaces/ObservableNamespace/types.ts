// packages/core/src/namespaces/ObservableNamespace/types.ts

import type { events, plugins } from "../../constants";
import type { EventsKeys } from "@real-router/types";

export type EventMethodMap = {
  [K in EventsKeys as (typeof events)[K]]: (typeof plugins)[K];
};
