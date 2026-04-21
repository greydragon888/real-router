import { memo } from "preact/compat";
import { useCallback, useMemo } from "preact/hooks";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import {
  shouldNavigate,
  buildHref,
  buildActiveClassName,
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

    const isActive = useIsActiveRoute(
      routeName,
      routeParams,
      activeStrict,
      ignoreQueryParams,
    );

    const href = useMemo(
      () => buildHref(router, routeName, routeParams),
      [router, routeName, routeParams],
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
        router.navigate(routeName, routeParams, routeOptions).catch(() => {});
      },
      [onClick, target, router, routeName, routeParams, routeOptions],
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
