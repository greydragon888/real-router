import { createActiveRouteSource } from "@real-router/sources";
import { createMemo, mergeProps, splitProps, useContext } from "solid-js";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import { RouterContext } from "../context";
import { createSignalFromSource } from "../createSignalFromSource";
import { useRouter } from "../hooks/useRouter";
import { shouldNavigate } from "../utils";

import type { LinkProps } from "../types";
import type { Params } from "@real-router/core";
import type { JSX } from "solid-js";

export function Link<P extends Params = Params>(
  props: Readonly<LinkProps<P>>,
): JSX.Element {
  const merged = mergeProps(
    {
      routeParams: EMPTY_PARAMS as P,
      routeOptions: EMPTY_OPTIONS,
      activeClassName: "active",
      activeStrict: false,
      ignoreQueryParams: true,
    },
    props,
  );

  const [local, rest] = splitProps(merged, [
    "routeName",
    "routeParams",
    "routeOptions",
    "activeClassName",
    "activeStrict",
    "ignoreQueryParams",
    "onClick",
    "target",
    "class",
    "children",
  ]);

  const router = useRouter();
  const ctx = useContext(RouterContext);

  const useFastPath =
    ctx?.routeSelector &&
    !local.activeStrict &&
    local.ignoreQueryParams &&
    local.routeParams === EMPTY_PARAMS;

  const isActive = useFastPath
    ? () => ctx.routeSelector(local.routeName)
    : createSignalFromSource(
        createActiveRouteSource(router, local.routeName, local.routeParams, {
          strict: local.activeStrict,
          ignoreQueryParams: local.ignoreQueryParams,
        }),
      );

  const href = createMemo(() => {
    if (typeof router.buildUrl === "function") {
      return router.buildUrl(local.routeName, local.routeParams);
    }

    return router.buildPath(local.routeName, local.routeParams);
  });

  const handleClick = (evt: MouseEvent) => {
    if (local.onClick) {
      local.onClick(evt);

      if (evt.defaultPrevented) {
        return;
      }
    }

    if (!shouldNavigate(evt) || local.target === "_blank") {
      return;
    }

    evt.preventDefault();
    router
      .navigate(local.routeName, local.routeParams, local.routeOptions)
      .catch(() => {});
  };

  const finalClassName = createMemo(() => {
    if (isActive() && local.activeClassName) {
      return local.class
        ? `${local.class} ${local.activeClassName}`.trim()
        : local.activeClassName;
    }

    return local.class ?? undefined;
  });

  return (
    <a {...rest} href={href()} class={finalClassName()} onClick={handleClick}>
      {local.children}
    </a>
  );
}
