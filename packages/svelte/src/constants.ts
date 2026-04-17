import type { NavigationOptions, Params } from "@real-router/core";

export const EMPTY_PARAMS: Params = Object.freeze({}) as Params;

export const EMPTY_OPTIONS: NavigationOptions = Object.freeze(
  {},
) as NavigationOptions;

export const NOOP = (): void => {};
