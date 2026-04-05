import type { StandardSchemaV1 } from "./types";

export { searchSchemaPlugin } from "./factory";

declare module "@real-router/core" {
  interface Route {
    searchSchema?: StandardSchemaV1;
  }
}

export type {
  SearchSchemaPluginOptions,
  StandardSchemaV1,
  StandardSchemaV1Issue,
  StandardSchemaV1Result,
} from "./types";
