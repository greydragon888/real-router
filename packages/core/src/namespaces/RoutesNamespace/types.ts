// packages/core/src/namespaces/RoutesNamespace/types.ts

import type { ActivationFnFactory } from "../../types";
import type {
  DefaultDependencies,
  Params,
  State,
  StateMetaInput,
} from "@real-router/types";

/**
 * Dependencies injected into RoutesNamespace.
 *
 * These are function references from the Router facade,
 * avoiding the need to pass the entire Router object.
 */
export interface RoutesDependencies<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  /** Register canActivate handler for a route */
  canActivate: (
    name: string,
    handler: ActivationFnFactory<Dependencies>,
  ) => void;

  /** Create state object */
  makeState: <P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
  ) => State<P, MP>;

  /** Get current router state */
  getState: () => State | undefined;

  /** Compare two states for equality */
  areStatesEqual: (
    state1: State | undefined,
    state2: State | undefined,
    ignoreQueryParams?: boolean,
  ) => boolean;
}

/**
 * Configuration storage for routes.
 * Stores decoders, encoders, default params, and forward mappings.
 */
export interface RouteConfig {
  /** Custom param decoders per route */
  decoders: Record<string, (params: Params) => Params>;

  /** Custom param encoders per route */
  encoders: Record<string, (params: Params) => Params>;

  /** Default params per route */
  defaultParams: Record<string, Params>;

  /** Forward mappings (source -> target) */
  forwardMap: Record<string, string>;
}
