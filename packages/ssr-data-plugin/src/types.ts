import type { Params } from "@real-router/core";

export type DataLoaderFn = (params: Params) => Promise<unknown>;

export type DataLoaderMap = Record<string, DataLoaderFn>;
