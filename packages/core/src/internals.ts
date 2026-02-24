import type { Router } from "./Router";
import type { EventMethodMap } from "./types";
import type {
  EventName,
  NavigationOptions,
  Options,
  Params,
  Plugin,
  RouteTreeState,
  SimpleState,
  State,
  StateMetaInput,
  Unsubscribe,
} from "@real-router/types";
import type { RouteTree } from "route-tree";

export interface RouterInternals {
  readonly makeState: <P extends Params = Params, MP extends Params = Params>(
    name: string,
    params?: P,
    path?: string,
    meta?: StateMetaInput<MP>,
    forceId?: number,
  ) => State<P, MP>;

  // MUTABLE — persistent-params-plugin swaps this for interception
  forwardState: <P extends Params = Params>(
    routeName: string,
    routeParams: P,
  ) => SimpleState<P>;

  readonly buildStateResolved: (
    resolvedName: string,
    resolvedParams: Params,
  ) => RouteTreeState | undefined;

  readonly matchPath: <P extends Params = Params, MP extends Params = Params>(
    path: string,
    options?: Options,
  ) => State<P, MP> | undefined;

  readonly getOptions: () => Options;

  readonly navigateToState: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => Promise<State>;

  readonly addEventListener: <E extends EventName>(
    eventName: E,
    cb: Plugin[EventMethodMap[E]],
  ) => Unsubscribe;

  readonly setRootPath: (rootPath: string) => void;
  readonly getRootPath: () => string;

  readonly getTree: () => RouteTree;

  readonly isDisposed: () => boolean;

  readonly noValidate: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Router<any> needed to accept all generic instantiations
const internals = new WeakMap<Router<any>, RouterInternals>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Router<any> needed to accept all generic instantiations
export function getInternals(router: Router<any>): RouterInternals {
  const ctx = internals.get(router);

  if (!ctx) {
    throw new TypeError(
      "[real-router] Invalid router instance — not found in internals registry",
    );
  }

  return ctx;
}

export function registerInternals(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Router<any> needed to accept all generic instantiations
  router: Router<any>,
  ctx: RouterInternals,
): void {
  internals.set(router, ctx);
}
