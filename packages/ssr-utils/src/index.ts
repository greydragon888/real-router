export { createRequestScope } from "./createRequestScope";

export type {
  IncomingMessageLike,
  RequestLike,
  RequestScope,
  RequestScopeSource,
} from "./createRequestScope";

export { getStaticPaths } from "./getStaticPaths";

export { hydrateRouter } from "./hydrateRouter";

export type { Deserialize, HydrateRouterOptions } from "./hydrateRouter";

export { serializeRouterState } from "./serializeRouterState";

export type { SerializeRouterStateOptions } from "./serializeRouterState";

export type { SerializedRouterState } from "@real-router/core/types";

export { serializeState } from "./serializeState";

export type { Serialize, SerializeStateOptions } from "./serializeState";

export type { StaticPathEntries } from "./getStaticPaths";
