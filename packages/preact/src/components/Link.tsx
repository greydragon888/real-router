import { memo } from "preact/compat";

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

    // Hash-aware active (#532) — see useIsActiveRoute for the contract.
    const isActive = useIsActiveRoute(
      routeName,
      routeParams,
      activeStrict,
      ignoreQueryParams,
      hash,
    );

    // `buildHref` is a cheap synchronous call (route-tree lookup + string
    // concat). Wrapping it in `useMemo` allocates a deps array on every
    // render that does not bail out — and on bail-out the function body
    // doesn't execute, so the cache never pays off. Same logic for
    // `buildActiveClassName` and `handleClick` below.
    const href = buildHref(
      router,
      routeName,
      routeParams,
      hash === undefined ? undefined : { hash },
    );

    const handleClick = (
      evt: JSX.TargetedMouseEvent<HTMLAnchorElement>,
    ): void => {
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
