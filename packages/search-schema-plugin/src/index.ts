import type { StandardSchemaV1 } from "./types";

export { searchSchemaPlugin } from "./factory";

declare module "@real-router/core" {
  interface Route {
    searchSchema?: StandardSchemaV1;
  }

  // Makes `searchSchema` patchable via `getRoutesApi(router).update(name, patch)`
  // (symmetric with the Route augmentation). `null` removes it; navigation reads
  // the schema lazily, so the next navigation validates against the new schema.
  interface RouteConfigUpdate {
    searchSchema?: StandardSchemaV1 | null;
  }
}

export type {
  SearchSchemaPluginOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
  StandardSchemaV1Result,
} from "./types";
