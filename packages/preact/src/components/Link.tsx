import { memo } from "preact/compat";
import { useCallback, useMemo } from "preact/hooks";

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
import type { FunctionComponent, JSX } from "preact";

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
    shallowEqual(prev.routeOptions, next.routeOptions)
  );
}

export const Link: FunctionComponent<LinkProps> = memo(
  ({
    routeName,
    routeParams = EMPTY_PARAMS,
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

    // memo + areLinkPropsEqual guarantees that on bail-out the component does
    // not render; on render, routeParams/routeOptions changed reference (true
    // change caught by shallowEqual), so they're safe to use directly in hook
    // deps without useStableValue.

    // Hash-aware active (#532): when `hash` prop is set, isActive requires
    // both route AND hash to match. Tab-style UI (multiple links sharing
    // routeName but differing in hash) needs this to avoid marking all tabs
    // active by route-name alone.
    const isActive = useIsActiveRoute(
      routeName,
      routeParams,
      activeStrict,
      ignoreQueryParams,
      hash,
    );

    const href = useMemo(
      () =>
        buildHref(
          router,
          routeName,
          routeParams,
          hash === undefined ? undefined : { hash },
        ),
      [router, routeName, routeParams, hash],
    );

    const handleClick = useCallback(
      (evt: JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
        if (onClick) {
          onClick(evt);

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
          routeName,
          routeParams,
          hash,
          routeOptions,
        ).catch(() => {});
      },
      [onClick, target, router, routeName, routeParams, routeOptions, hash],
    );

    const finalClassName = useMemo(
      () => buildActiveClassName(isActive, activeClassName, className),
      [isActive, activeClassName, className],
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
