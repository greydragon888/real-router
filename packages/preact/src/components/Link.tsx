import { memo } from "preact/compat";
import { useCallback, useMemo } from "preact/hooks";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import {
  shouldNavigate,
  buildHref,
  buildActiveClassName,
} from "../dom-utils/index.js";
import { useIsActiveRoute } from "../hooks/useIsActiveRoute";
import { useRouter } from "../hooks/useRouter";
import { useStableValue } from "../hooks/useStableValue";

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
    JSON.stringify(prev.routeParams) === JSON.stringify(next.routeParams) &&
    JSON.stringify(prev.routeOptions) === JSON.stringify(next.routeOptions)
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

    const stableParams = useStableValue(routeParams);
    const stableOptions = useStableValue(routeOptions);

    const isActive = useIsActiveRoute(
      routeName,
      stableParams,
      activeStrict,
      ignoreQueryParams,
    );

    const href = useMemo(
      () => buildHref(router, routeName, stableParams),
      [router, routeName, stableParams],
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
        router.navigate(routeName, stableParams, stableOptions).catch(() => {});
      },
      [onClick, target, router, routeName, stableParams, stableOptions],
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
