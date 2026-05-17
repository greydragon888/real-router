import { createActiveRouteSource } from "@real-router/sources";
import { createMemo, mergeProps, splitProps } from "solid-js";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import { useRequiredRouterContext } from "../context";
import { createSignalFromSource } from "../createSignalFromSource";
import {
  shouldNavigate,
  buildHref,
  buildActiveClassName,
  navigateWithHash,
} from "../dom-utils";

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
    "hash",
    "onClick",
    "target",
    "class",
    "children",
  ]);

  const ctx = useRequiredRouterContext("Link");
  const router = ctx.router;

  // Hash-aware active state (#532). `routeSelector` (the O(1) shared selector)
  // doesn't know about hash — when `hash` prop is set, fall back to the slow
  // path so the source's hash comparison kicks in. Tab-style UI is opt-in via
  // the prop, so the fast path stays open for the typical Link case.
  //
  // §8.1 audit fix: read `props.routeParams === undefined` directly instead of
  // `local.routeParams === EMPTY_PARAMS`. The latter went through `mergeProps`
  // proxy and relied on a hidden contract (mergeProps preserves the default
  // sentinel identity when consumer omits the field). The new check is
  // explicit: "fast path kicks in when consumer did not supply routeParams".
  const useFastPath =
    local.hash === undefined &&
    !local.activeStrict &&
    local.ignoreQueryParams &&
    props.routeParams === undefined;

  const buildActiveOptions = () => {
    const base = {
      strict: local.activeStrict,
      ignoreQueryParams: local.ignoreQueryParams,
    };

    if (local.hash === undefined) {
      return base;
    }

    return { ...base, hash: local.hash };
  };

  const isActive = useFastPath
    ? () => ctx.routeSelector(local.routeName)
    : createSignalFromSource(
        createActiveRouteSource(
          router,
          local.routeName,
          local.routeParams,
          buildActiveOptions(),
        ),
      );

  // Separate memo for the hash-options object so the `{ hash }` literal
  // is allocated only when `local.hash` actually changes (instead of on
  // every `href` memo evaluation). For static `<Link hash="foo">` this
  // produces ONE allocation total; for dynamic hash through `<Show keyed>`
  // workaround the allocation cost scales with hash changes, not with
  // routeName/routeParams changes (§8c A4 audit fix).
  const hashOpts = createMemo(() =>
    local.hash === undefined ? undefined : { hash: local.hash },
  );

  const href = createMemo(() =>
    buildHref(router, local.routeName, local.routeParams, hashOpts()),
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
    navigateWithHash(
      router,
      local.routeName,
      local.routeParams,
      local.hash,
      local.routeOptions,
    ).catch(() => {});
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
