import { Text, useFocus, useInput } from "ink";
import { memo, useCallback } from "react";

import { EMPTY_OPTIONS, EMPTY_PARAMS } from "../constants";
import { shallowEqual } from "../dom-utils/index.js";
import { useIsActiveRoute } from "../hooks/useIsActiveRoute";
import { useRouter } from "../hooks/useRouter";

import type { InkLinkProps } from "../ink-types";
import type { FC } from "react";

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
    shallowEqual(prev.routeOptions, next.routeOptions)
  );
}

const InkLinkImpl: FC<InkLinkProps> = ({
  routeName,
  routeParams = EMPTY_PARAMS,
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
  const isRouteActive = useIsActiveRoute(
    routeName,
    routeParams,
    activeStrict,
    ignoreQueryParams,
  );

  const activate = useCallback(() => {
    onSelect?.();
    router.navigate(routeName, routeParams, routeOptions).catch(() => {});
  }, [onSelect, router, routeName, routeParams, routeOptions]);

  useInput(
    (_input, key) => {
      if (key.return) {
        activate();
      }
    },
    { isActive: isFocused },
  );

  let finalColor = color;

  if (isFocused) {
    finalColor = focusColor ?? activeColor ?? color;
  } else if (isRouteActive) {
    finalColor = activeColor ?? color;
  }

  let finalInverse = inverse;

  if (isFocused) {
    finalInverse = focusInverse ?? activeInverse ?? inverse;
  } else if (isRouteActive) {
    finalInverse = activeInverse ?? inverse;
  }

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
