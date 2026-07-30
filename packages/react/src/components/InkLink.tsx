import { Text, useFocus, useInput } from "ink";
import { memo } from "react";

import { EMPTY_OPTIONS, EMPTY_PARAMS } from "../constants";
import { shallowEqual } from "../dom-utils";
import { useIsActiveRoute } from "../hooks/useIsActiveRoute";
import { useRouter } from "../hooks/useRouter";

import type { InkLinkProps } from "../ink-types";
import type { FC } from "react";

/**
 * Pick the most specific value across focus / active / base priority.
 * Focus wins over active; active wins over base. Each layer falls through
 * to the next when its value is undefined, matching the original explicit
 * if/else cascade for both `color` and `inverse`.
 */
function pickPriority<T>(
  isFocused: boolean,
  isRouteActive: boolean,
  focusValue: T | undefined,
  activeValue: T | undefined,
  baseValue: T | undefined,
): T | undefined {
  if (isFocused) {
    return focusValue ?? activeValue ?? baseValue;
  }

  if (isRouteActive) {
    return activeValue ?? baseValue;
  }

  return baseValue;
}

function areInkLinkPropsEqual(
  prev: Readonly<InkLinkProps>,
  next: Readonly<InkLinkProps>,
): boolean {
  return (
    prev.routeName === next.routeName &&
    prev.activeStrict === next.activeStrict &&
    prev.ignoreQueryParams === next.ignoreQueryParams &&
    prev.color === next.color &&
    prev.activeColor === next.activeColor &&
    prev.focusColor === next.focusColor &&
    prev.inverse === next.inverse &&
    prev.activeInverse === next.activeInverse &&
    prev.focusInverse === next.focusInverse &&
    prev.id === next.id &&
    prev.autoFocus === next.autoFocus &&
    prev.onSelect === next.onSelect &&
    prev.children === next.children &&
    shallowEqual(prev.routeParams, next.routeParams) &&
    shallowEqual(prev.routeSearch, next.routeSearch) &&
    shallowEqual(prev.routeOptions, next.routeOptions)
  );
}

const InkLinkImpl: FC<InkLinkProps> = ({
  routeName,
  routeParams,
  routeSearch,
  routeOptions = EMPTY_OPTIONS,
  activeStrict = false,
  ignoreQueryParams = true,
  color,
  activeColor,
  focusColor,
  inverse,
  activeInverse,
  focusInverse,
  id,
  autoFocus,
  onSelect,
  children,
}) => {
  const router = useRouter();
  const { isFocused } = useFocus({
    ...(id !== undefined && { id }),
    ...(autoFocus !== undefined && { autoFocus }),
  });

  // Pass `routeParams` straight through (possibly `undefined`) so a no-params
  // `<InkLink>` and a manual `useIsActiveRoute(routeName)` share ONE cached
  // active-route source — `createActiveRouteSource` keys `undefined` as "" but
  // EMPTY_PARAMS ({}) as "{}", so defaulting before the call would split the
  // same question into a second eager subscription (#776).
  const isRouteActive = useIsActiveRoute(
    routeName,
    routeParams,
    routeSearch,
    activeStrict,
    ignoreQueryParams,
  );

  // Navigation needs a concrete params object — default here only.
  const paramsForNav = routeParams ?? EMPTY_PARAMS;

  // No useCallback: `useInput` consumes the handler via its own internal
  // ref; a stable identity provides no cache-bail-out benefit here. Same
  // reasoning as Link's handleClick.
  useInput(
    (_input, key) => {
      if (key.return) {
        // Isolate a throwing `onSelect`: unlike the DOM `<Link>` (where the
        // browser contains event-listener exceptions), an uncaught throw here
        // escapes into ink's stdin handler → `uncaughtException` crashes a real
        // CLI, and it also swallows the navigation below. Log and still
        // navigate — mirrors `route-announcer`'s consumer-callback isolation.
        try {
          onSelect?.();
        } catch (error) {
          console.error(
            "[real-router] InkLink onSelect threw; proceeding with navigation.",
            error,
          );
        }
        // Query channel at position 3 (RFC-4 M2 / #1548) — from `routeSearch`;
        // options at position 4.
        router
          .navigate(routeName, paramsForNav, routeSearch, routeOptions)
          .catch(() => {});
      }
    },
    { isActive: isFocused },
  );

  const finalColor = pickPriority(
    isFocused,
    isRouteActive,
    focusColor,
    activeColor,
    color,
  );
  const finalInverse = pickPriority(
    isFocused,
    isRouteActive,
    focusInverse,
    activeInverse,
    inverse,
  );

  const textProps: { color?: string; inverse?: boolean } = {};

  if (finalColor !== undefined) {
    textProps.color = finalColor;
  }

  if (finalInverse !== undefined) {
    textProps.inverse = finalInverse;
  }

  return <Text {...textProps}>{children}</Text>;
};

export const InkLink: FC<InkLinkProps> = memo(
  InkLinkImpl,
  areInkLinkPropsEqual,
);

InkLink.displayName = "InkLink";
