import { memo } from "preact/compat";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import {
  shouldNavigate,
  buildHref,
  buildActiveClassName,
  navigateWithHash,
  resolveLinkTarget,
  shallowEqual,
} from "../dom-utils";
import { useIsActiveRoute } from "../hooks/useIsActiveRoute";
import { useRouter } from "../hooks/useRouter";

import type { LinkProps } from "../types";
import type { FunctionComponent, TargetedMouseEvent } from "preact";

/**
 * Custom comparator for `Link`'s `memo()` wrapper.
 *
 * **Maintenance contract:** every field in `LinkProps` MUST appear in either
 * the `===` chain (primitives + identity-checked references like `onClick` /
 * `children` / `style`) or in the `shallowEqual` arms (object-valued
 * `routeParams` / `routeOptions`). When adding a new prop to `LinkProps`,
 * extend this function in the same PR — `tests/functional/Link.test.tsx`
 * contains a regression-guard that fails the build if `LinkProps` gains a
 * field that is not compared here.
 *
 * **Intentional omissions:** `props` (the rest-spread of HTMLAnchorElement
 * attributes — `aria-label`, `data-*`, `target`-other-than-`_blank`-handling,
 * etc.) is NOT compared. A change to `aria-label` will NOT trigger a Link
 * re-render. This is by design: dynamic `aria-label` is rare; consumers who
 * truly need a reactive aria-label should call `<Link key={ariaLabel}>` to
 * force a remount.
 */
function areLinkPropsEqual(
  prev: Readonly<LinkProps>,
  next: Readonly<LinkProps>,
): boolean {
  return (
    prev.routeName === next.routeName &&
    prev.className === next.className &&
    prev.activeClassName === next.activeClassName &&
    prev.activeStrict === next.activeStrict &&
    prev.ignoreQueryParams === next.ignoreQueryParams &&
    prev.onClick === next.onClick &&
    prev.target === next.target &&
    prev.style === next.style &&
    prev.children === next.children &&
    prev.hash === next.hash &&
    shallowEqual(prev.routeParams, next.routeParams) &&
    shallowEqual(prev.routeSearch, next.routeSearch) &&
    shallowEqual(prev.to, next.to) &&
    shallowEqual(prev.routeOptions, next.routeOptions)
  );
}

export const Link: FunctionComponent<LinkProps> = memo(
  ({
    routeName,
    routeParams,
    routeSearch,
    to,
    routeOptions = EMPTY_OPTIONS,
    className,
    activeClassName = "active",
    activeStrict = false,
    ignoreQueryParams = true,
    hash,
    onClick,
    target,
    children,
    ...props
  }) => {
    const router = useRouter();

    // Resolve the two prop forms into one channel triple (RFC-4 M2 B2, #1548):
    // a `to` descriptor supersedes the channel props (dev-warn on conflict).
    const { name, params, search } = resolveLinkTarget(
      to,
      routeName ?? "",
      routeParams,
      routeSearch,
    );

    // memo + areLinkPropsEqual guarantees that on bail-out the component does
    // not render; on render, routeParams/routeOptions changed reference (true
    // change caught by shallowEqual), so they're safe to use directly in hook
    // deps without useStableValue.

    // Pass `routeParams` straight through (possibly `undefined`) — do NOT default
    // to EMPTY_PARAMS before the active-route call. `createActiveRouteSource` keys
    // `params === undefined` as "" but EMPTY_PARAMS ({}) as "{}", so a no-params
    // `<Link>` and a manual `useIsActiveRoute(routeName)` only share ONE cached
    // source (one router subscription) when both pass `undefined`; defaulting here
    // would split the same question into a second eager subscription (#776).
    // `shallowEqual(undefined, undefined)` keeps the memo fast-path unchanged.
    //
    // Hash-aware active (#532) — see useIsActiveRoute for the contract.
    const isActive = useIsActiveRoute(
      name,
      params,
      search,
      activeStrict,
      ignoreQueryParams,
      hash,
    );

    // Navigation/href building need a concrete params object — default here only.
    // `search` stays raw (`undefined` when unset).
    const paramsForNav = params ?? EMPTY_PARAMS;

    // `buildHref` is a cheap synchronous call (route-tree lookup + string
    // concat). Wrapping it in `useMemo` allocates a deps array on every
    // render that does not bail out — and on bail-out the function body
    // doesn't execute, so the cache never pays off. Same logic for
    // `buildActiveClassName` and `handleClick` below.
    const href = buildHref(router, name, paramsForNav, search, hash);

    const handleClick = (evt: TargetedMouseEvent<HTMLAnchorElement>): void => {
      if (onClick) {
        // Isolate a throwing user handler (#1436): native <a> logs a throwing
        // click listener and still performs the default action. Without this
        // the throw escapes before navigateWithHash, silently aborting
        // navigation. The user's own preventDefault() runs before any throw, so
        // the defaultPrevented contract below is unchanged. Mirrors vue's #1352.
        try {
          onClick(evt);
        } catch (error) {
          console.error(
            "[real-router] A <Link> onClick handler threw; navigation is unaffected.",
            error,
          );
        }

        if (evt.defaultPrevented) {
          return;
        }
      }

      if (!shouldNavigate(evt) || target === "_blank") {
        return;
      }

      evt.preventDefault();
      navigateWithHash(
        router,
        name,
        paramsForNav,
        search,
        hash,
        routeOptions,
      ).catch(() => {});
    };

    const finalClassName = buildActiveClassName(
      isActive,
      activeClassName,
      className,
    );

    return (
      <a
        {...props}
        href={href}
        className={finalClassName}
        onClick={handleClick}
      >
        {children}
      </a>
    );
  },
  areLinkPropsEqual,
);

Link.displayName = "Link";
