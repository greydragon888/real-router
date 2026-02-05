// packages/core-types/modules/router.ts

/**
 * Base router types without Router class dependency.
 *
 * Router-dependent types (Route, RouteConfigUpdate, ActivationFnFactory,
 * MiddlewareFactory, PluginFactory) are defined in @real-router/core
 * to avoid circular dependencies.
 */

import type {
  State,
  Params,
  DoneFn,
  NavigationOptions,
  RouterError,
  Unsubscribe,
  CancelFn,
} from "./base";
import type { LimitsConfig } from "./limits";
import type { QueryParamsMode, QueryParamsOptions } from "./route-node-types";

// Logger types (duplicated from @real-router/logger to avoid dependency)
type LogLevel = "log" | "warn" | "error";
type LogLevelConfig = "all" | "warn-error" | "error-only" | "none";
type LogCallback = (
  level: LogLevel,
  context: string,
  message: string,
  ...args: unknown[]
) => void;
interface LoggerConfig {
  level: LogLevelConfig;
  callback?: LogCallback | undefined;
  callbackIgnoresLevel?: boolean;
}

/**
 * Router configuration options.
 *
 * Note: For input, use `Partial<Options>` as all fields have defaults.
 * After initialization, `getOptions()` returns resolved `Options` with all fields populated.
 */
export interface Options {
  /**
   * Default route to navigate to on start.
   * Empty string means no default route.
   *
   * @default ""
   */
  defaultRoute: string;

  /**
   * Default parameters for the default route.
   *
   * @default {}
   */
  defaultParams: Params;

  /**
   * How to handle trailing slashes in URLs.
   * - "strict": Route must match exactly
   * - "never": Always remove trailing slash
   * - "always": Always add trailing slash
   * - "preserve": Keep as provided
   *
   * @default "preserve"
   */
  trailingSlash: "strict" | "never" | "always" | "preserve";

  /**
   * Whether route names are case-sensitive.
   *
   * @default false
   */
  caseSensitive: boolean;

  /**
   * How to encode URL parameters.
   * - "default": Standard encoding
   * - "uri": URI encoding (encodeURI)
   * - "uriComponent": Component encoding (encodeURIComponent)
   * - "none": No encoding
   *
   * @default "default"
   */
  urlParamsEncoding: "default" | "uri" | "uriComponent" | "none";

  /**
   * How to handle query parameters.
   *
   * @default "loose"
   */
  queryParamsMode: QueryParamsMode;

  /**
   * Query parameter parsing options.
   *
   * @default undefined
   */
  queryParams?: QueryParamsOptions;

  /**
   * Allow matching routes that don't exist.
   * When true, unknown routes navigate without error.
   *
   * @default true
   */
  allowNotFound: boolean;

  /**
   * Rewrite path on successful match.
   *
   * @default false
   */
  rewritePathOnMatch: boolean;

  /**
   * Logger configuration.
   *
   * @default undefined
   */
  logger?: Partial<LoggerConfig>;

  /**
   * Router resource limits configuration.
   * Controls maximum allowed values for various router operations.
   *
   * @default DEFAULT_LIMITS (from LimitsNamespace)
   */
  limits?: Partial<LimitsConfig>;

  /**
   * Disables argument validation in public router methods.
   * Use in production for performance. Keep false in development for early error detection.
   *
   * @default false
   */
  noValidate?: boolean;
}

export type ActivationFn = (
  toState: State,
  fromState: State | undefined,
  done: DoneFn,
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
) => boolean | Promise<boolean | object | void> | State | void;

export type DefaultDependencies = object;

export interface Config {
  decoders: Record<string, (params: Params) => Params>;
  encoders: Record<string, (params: Params) => Params>;
  defaultParams: Record<string, Params>;
  forwardMap: Record<string, string>;
}

export interface Plugin {
  onStart?: () => void;
  onStop?: () => void;
  onTransitionStart?: (toState: State, fromState?: State) => void;
  onTransitionCancel?: (toState: State, fromState?: State) => void;
  onTransitionError?: (
    toState: State | undefined,
    fromState: State | undefined,
    err: RouterError,
  ) => void;
  onTransitionSuccess?: (
    toState: State,
    fromState: State | undefined,
    opts: NavigationOptions,
  ) => void;
  teardown?: () => void;
}

// eslint-disable-next-line sonarjs/redundant-type-aliases
export type Middleware = ActivationFn;

export interface SubscribeState {
  route: State;
  previousRoute?: State | undefined;
}

export type SubscribeFn = (state: SubscribeState) => void;

export interface Listener {
  [key: string]: unknown;
  next: (val: unknown) => void;
  error?: (err: unknown) => void;
  complete?: () => void;
}

export interface Subscription {
  unsubscribe: Unsubscribe;
}

/**
 * Navigator interface - a minimal, safe subset of Router methods.
 *
 * Provides only the essential navigation and state inspection methods.
 * Excludes lifecycle methods (start, stop), plugin management, and internal APIs.
 * Use this when you need to pass a limited router interface to components.
 *
 * For full router access, use the Router interface directly or the useRouter() hook.
 */
export interface Navigator {
  navigate: (
    routeName: string,
    routeParamsOrDone?: Params | DoneFn,
    optionsOrDone?: NavigationOptions | DoneFn,
    done?: DoneFn,
  ) => CancelFn;
  getState: () => State | undefined;
  isActiveRoute: (
    name: string,
    params?: Params,
    strictEquality?: boolean,
    ignoreQueryParams?: boolean,
  ) => boolean;
  subscribe: (listener: SubscribeFn) => Unsubscribe;
}
