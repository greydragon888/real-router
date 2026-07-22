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
  resolveLinkTarget,
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
    "routeSearch",
    "to",
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
    // An empty `routeName` is a misuse (matches no route). It must NOT take the
    // routeSelector fast path, whose unstarted sentinel (`route?.name ?? ""`)
    // makes `isRouteActive("", "") === true` — a misused empty-name Link would
    // light up before `router.start()`. Route it to the slow path instead, which
    // reads `router.isActiveRoute("") === false` in every router state (#1427).
    local.routeName !== "" &&
    local.to === undefined &&
    local.hash === undefined &&
    !local.activeStrict &&
    local.ignoreQueryParams &&
    props.routeParams === undefined &&
    // A `routeSearch` (or a `to` descriptor) link forces the slow path (RFC-4 M2,
    // #1548) — the name-only routeSelector is query-blind, exactly like `hash`.
    props.routeSearch === undefined;

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

  // Resolve the slow-path active source's channels once at init (RFC-4 M2 B2,
  // #1548) — solid captures slow-path Link props at init (CLAUDE "Link Props Are
  // Captured at Init"). A `to` descriptor supersedes the channel props. Uses the
  // RAW `props.routeParams`/`props.routeSearch` (NOT the mergeProps EMPTY_PARAMS
  // default) so an omitted-params Link keys the active source "" — sharing ONE
  // cached source with a manual `createActiveRouteSource(router, name, undefined,
  // …)` rather than splitting on "{}" (#776). `local.routeParams` (concrete
  // EMPTY_PARAMS) stays for nav/href below.
  const activeTarget = resolveLinkTarget(
    local.to,
    local.routeName ?? "",
    props.routeParams,
    props.routeSearch,
  );

  const isActive = useFastPath
    ? () => ctx.routeSelector(local.routeName ?? "")
    : createSignalFromSource(
        createActiveRouteSource(
          router,
          activeTarget.name,
          activeTarget.params,
          activeTarget.search,
          buildActiveOptions(),
        ),
      );

  const href = createMemo(() => {
    // Reactive channel resolution for href (RFC-4 M2 B2, #1548): `to` supersedes
    // the channel props. `local.routeParams` is the mergeProps EMPTY_PARAMS
    // default (concrete) for the channel form; a `to` descriptor may omit params.
    const resolved = resolveLinkTarget(
      local.to,
      local.routeName ?? "",
      local.routeParams,
      local.routeSearch,
    );

    return buildHref(
      router,
      resolved.name,
      resolved.params ?? EMPTY_PARAMS,
      resolved.search,
      local.hash,
    );
  });

  const handleClick = (evt: MouseEvent) => {
    if (local.onClick) {
      // Isolate a throwing user handler (#1436): native <a> logs a throwing
      // click listener and still performs the default action. Without this the
      // throw escapes before navigateWithHash, silently aborting navigation.
      // The user's own preventDefault() runs before any throw, so the
      // defaultPrevented contract below is unchanged. Mirrors vue's #1352.
      try {
        local.onClick(evt);
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

    if (!shouldNavigate(evt) || local.target === "_blank") {
      return;
    }

    evt.preventDefault();

    const resolved = resolveLinkTarget(
      local.to,
      local.routeName ?? "",
      local.routeParams,
      local.routeSearch,
    );

    navigateWithHash(
      router,
      resolved.name,
      resolved.params ?? EMPTY_PARAMS,
      resolved.search,
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
