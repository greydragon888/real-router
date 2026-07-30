import type {
  NavigationOptions,
  NavigationTarget,
  Navigator,
  Params,
  SearchParams,
  State,
} from "@real-router/core";
import type { Snippet } from "svelte";

export interface RouteContext<P extends Params = Params> {
  readonly navigator: Navigator;
  readonly route: { readonly current: State<P> | undefined };
  readonly previousRoute: { readonly current: State | undefined };
}

/**
 * Props accepted by `<Link>`. Mirrors the inline prop shape in
 * `src/components/Link.svelte` — any prop landed by `Link.svelte` is also
 * declared here, including the rest-props index signature for arbitrary
 * HTML attributes spread onto the rendered `<a>`.
 */
export interface LinkProps<P extends Params = Params> {
  /**
   * All other props are spread onto the rendered `<a>` element. Use this for
   * `aria-*`, `data-*`, `id`, `title`, and any other native attributes.
   */
  readonly [key: string]: unknown;
  /**
   * Route name (channel form). Optional because the descriptor form (`to`)
   * omits it. The two forms are mutually exclusive — enforced at runtime by
   * `resolveLinkTarget` (dev-warn on conflict, `to` wins). Svelte's index
   * signature above precludes a strict never-union, so the exclusion is a
   * runtime contract here (react/preact/solid enforce it in the type).
   */
  readonly routeName?: string;
  readonly routeParams?: P;
  /**
   * Query (search) params for the link's target (RFC-4 M2, #1548) — parallel to
   * `routeParams`, the path/query split's view-layer channel.
   */
  readonly routeSearch?: SearchParams;
  /**
   * Descriptor form (RFC-4 M2 B2, #1548): `to={{ name, params?, search? }}` —
   * mutually exclusive with the channel props above.
   */
  readonly to?: NavigationTarget<P>;
  readonly routeOptions?: NavigationOptions;
  readonly class?: string;
  readonly activeClassName?: string;
  readonly activeStrict?: boolean;
  readonly ignoreQueryParams?: boolean;
  /**
   * URL fragment (decoded, no leading "#") — #532.
   * - `undefined` → preserve current `state.context.url.hash` on click.
   * - `""` → clear the hash.
   * - `"value"` → set the hash; same-route different-hash clicks route through
   *   `navigateWithHash`, which adds `force: true, hashChange: true` to
   *   bypass core's SAME_STATES check.
   */
  readonly hash?: string;
  readonly target?: string;
  readonly children?: Snippet;
  readonly onclick?: (evt: MouseEvent) => void;
}
