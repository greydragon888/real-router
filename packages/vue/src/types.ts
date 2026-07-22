import type {
  NavigationOptions,
  Params,
  Navigator,
  SearchParams,
  State,
} from "@real-router/core";
import type { Ref } from "vue";

/**
 * `route`/`previousRoute` are read-only reactive references. They may be
 * implemented as `shallowRef` or `computed` depending on the composable
 * (`useRoute` mirrors via `shallowRef`, `useRouteNode` derives via `computed`),
 * but consumers only need `.value` read access — typed as `Readonly<Ref<…>>`.
 */
export interface RouteContext<P extends Params = Params> {
  navigator: Navigator;
  route: Readonly<Ref<State<P> | undefined>>;
  previousRoute: Readonly<Ref<State | undefined>>;
}

export interface LinkProps<P extends Params = Params> {
  routeName: string;
  routeParams?: P;
  /**
   * Query (search) params for the link's target (RFC-4 M2, #1548) — parallel to
   * `routeParams`, the path/query split's view-layer channel.
   */
  routeSearch?: SearchParams;
  routeOptions?: NavigationOptions;
  class?: string;
  activeClassName?: string;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
  target?: string;
  /**
   * URL fragment (#532). Decoded, no leading `#`. Tri-state:
   * - `undefined` (default) — preserves current `state.context.url.hash` on click.
   * - `""` — clears the hash.
   * - `"value"` — sets the hash; click routes through `navigateWithHash`,
   *   which auto-adds `force: true, hashChange: true` for same-route hash
   *   transitions (bypasses core's SAME_STATES check).
   * Active state is hash-aware when `hash` is set.
   */
  hash?: string;
}
