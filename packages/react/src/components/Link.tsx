import { memo, useMemo } from "react";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import {
  shouldNavigate,
  buildHref,
  buildActiveClassName,
  navigateWithHash,
  shallowEqual,
} from "../dom-utils";
import { useIsActiveRoute } from "../hooks/useIsActiveRoute";
import { useRouter } from "../hooks/useRouter";

import type { LinkProps } from "../types";
import type { FC, MouseEvent } from "react";

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
    shallowEqual(prev.routeOptions, next.routeOptions)
  );
}

const LinkImpl: FC<LinkProps> = ({
  routeName,
  routeParams,
  routeSearch,
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
  // memo + areLinkPropsEqual guarantees that on bail-out the component does
  // not render; on render, routeParams/routeOptions either changed reference
  // (true change) or comparator failed (e.g., BigInt fallback to identity),
  // so they're safe to use directly in hook deps.

  const router = useRouter();

  // Pass `routeParams` straight through (possibly `undefined`) — do NOT default
  // to EMPTY_PARAMS before the active-route call. `createActiveRouteSource` keys
  // params as `params === undefined ? "" : canonicalJson(params)`, so a no-params
  // `<Link>` and a manual `useIsActiveRoute(routeName)` both key "" and share ONE
  // cached source (one router subscription). Defaulting to EMPTY_PARAMS ({}) here
  // would key "{}" and split the same logical question into a second eager
  // subscription (#776). `shallowEqual(undefined, undefined)` keeps the memo
  // fast-path, so the comparison behaviour is unchanged.
  //
  // When `hash` prop is set, active state requires both route AND hash to
  // match (#532). Without this, three tab links sharing routeName="settings"
  // would all be marked active by route-name alone, defeating tab semantics.
  const isActive = useIsActiveRoute(
    routeName,
    routeParams,
    routeSearch,
    activeStrict,
    ignoreQueryParams,
    hash,
  );

  // Navigation/href building need a concrete params object — default here only.
  // `routeSearch` stays raw (`undefined` when unset): buildHref / navigateWithHash
  // pass it straight to the query slot, which tolerates `undefined`.
  const paramsForNav = routeParams ?? EMPTY_PARAMS;

  const href = buildHref(router, routeName, paramsForNav, routeSearch, hash);

  // useCallback was wasteful: 7 deps recreated the closure on every meaningful
  // render anyway, and `<a onClick>` does not benefit from a stable function
  // identity (no child-memo-bail-out chain past it). Inline arrow function is
  // what React Compiler emits automatically for this shape.
  const handleClick = (evt: MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      // Isolate a throwing user handler (#1436): native <a> logs a throwing
      // click listener and still performs the default action. Without this the
      // throw escapes before navigateWithHash, silently aborting navigation.
      // The user's own preventDefault() runs before any throw, so the
      // defaultPrevented contract below is unchanged. Mirrors vue's #1352.
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

    if (!shouldNavigate(evt.nativeEvent) || target === "_blank") {
      return;
    }

    evt.preventDefault();
    navigateWithHash(
      router,
      routeName,
      paramsForNav,
      routeSearch,
      hash,
      routeOptions,
    ).catch(() => {});
  };

  // Memoize the joined class string. parseTokens + Set + join on every render
  // adds up on pages with N Links navigating frequently; deps cover every
  // input the function reads so cache invalidation is exact.
  const finalClassName = useMemo(
    () => buildActiveClassName(isActive, activeClassName, className),
    [isActive, activeClassName, className],
  );

  return (
    <a {...props} href={href} className={finalClassName} onClick={handleClick}>
      {children}
    </a>
  );
};

export const Link: FC<LinkProps> = memo(LinkImpl, areLinkPropsEqual);

Link.displayName = "Link";
