import { createActiveRouteSource } from "@real-router/sources";
import { createMemo, mergeProps, splitProps, useContext } from "solid-js";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import { RouterContext } from "../context";
import { createSignalFromSource } from "../createSignalFromSource";
import {
  shouldNavigate,
  buildHref,
  buildActiveClassName,
} from "../dom-utils/index.js";

import type { LinkProps } from "../types";
import type { Params, Router } from "@real-router/core";
import type { RouterSource } from "@real-router/sources";
import type { JSX } from "solid-js";

// Slow-path source cache: shared per-router, keyed by routeName + params + flags.
// Captured slow-path values are stable per Link (props captured at init), so the
// cache key is guaranteed stable for the lifetime of any consumer.
const activeSourceCache = new WeakMap<
  Router,
  Map<string, RouterSource<boolean>>
>();

function getOrCreateActiveSource(
  router: Router,
  routeName: string,
  routeParams: Params,
  activeStrict: boolean,
  ignoreQueryParams: boolean,
): RouterSource<boolean> {
  let perRouter = activeSourceCache.get(router);

  if (!perRouter) {
    perRouter = new Map();
    activeSourceCache.set(router, perRouter);
  }

  const key = `${routeName}|${JSON.stringify(routeParams)}|${activeStrict}|${ignoreQueryParams}`;
  let source = perRouter.get(key);

  if (!source) {
    source = createActiveRouteSource(router, routeName, routeParams, {
      strict: activeStrict,
      ignoreQueryParams,
    });
    perRouter.set(key, source);
  }

  return source;
}

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

  const ctx = useContext(RouterContext);

  if (!ctx) {
    throw new Error("Link must be used within a RouterProvider");
  }

  const router = ctx.router;

  const useFastPath =
    !local.activeStrict &&
    local.ignoreQueryParams &&
    local.routeParams === EMPTY_PARAMS;

  const isActive = useFastPath
    ? () => ctx.routeSelector(local.routeName)
    : createSignalFromSource(
        getOrCreateActiveSource(
          router,
          local.routeName,
          local.routeParams,
          local.activeStrict,
          local.ignoreQueryParams,
        ),
      );

  const href = createMemo(() =>
    buildHref(router, local.routeName, local.routeParams),
  );

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

  const finalClassName = createMemo(() =>
    buildActiveClassName(isActive(), local.activeClassName, local.class),
  );

  return (
    <a
      {...(rest as JSX.HTMLAttributes<HTMLAnchorElement>)}
      href={href()}
      class={finalClassName()}
      onClick={handleClick}
    >
      {local.children}
    </a>
  );
}
