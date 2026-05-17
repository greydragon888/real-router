import { createActiveRouteSource } from "@real-router/sources";
import { createEffect, onCleanup } from "solid-js";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import { createSignalFromSource } from "../createSignalFromSource";
import { shouldNavigate, applyLinkA11y, buildHref } from "../dom-utils";
import { useRouter } from "../hooks/useRouter";

import type { Params } from "@real-router/core";

export interface LinkDirectiveOptions<P extends Params = Params> {
  routeName: string;
  routeParams?: P;
  routeOptions?: Record<string, unknown>;
  activeClassName?: string;
  activeStrict?: boolean;
  ignoreQueryParams?: boolean;
}

export function link<P extends Params = Params>(
  element: HTMLElement,
  accessor: () => LinkDirectiveOptions<P>,
): void {
  const router = useRouter();
  const options = accessor();

  // audit-2026-05-17 §8a cleanup — single instanceof probe, single EMPTY_PARAMS
  // default. Previously evaluated three times for the <a>-only branches and
  // twice for routeParams. The directive accessor is read once at init
  // (documented "use:link Options Are Captured Once"), so both lookups are
  // stable and worth hoisting.
  const anchor = element instanceof HTMLAnchorElement ? element : null;
  const resolvedRouteParams = (options.routeParams ?? EMPTY_PARAMS) as P;
  const resolvedRouteOptions = options.routeOptions ?? EMPTY_OPTIONS;

  // Set href on <a> elements
  if (anchor) {
    const href = buildHref(router, options.routeName, resolvedRouteParams);

    if (href === undefined) {
      anchor.removeAttribute("href");
    } else {
      anchor.href = href;
    }
  }

  applyLinkA11y(element);

  // Active class tracking: only `isActive` is reactive (createEffect toggles
  // the class on each emit). The `options` object itself is captured ONCE at
  // init (see gotcha "use:link Options Are Captured Once") — changing
  // `activeClassName` / `routeName` / `routeParams` later has no effect.
  if (options.activeClassName) {
    const activeClassName = options.activeClassName;
    const activeSource = createActiveRouteSource(
      router,
      options.routeName,
      resolvedRouteParams,
      {
        strict: options.activeStrict ?? false,
        ignoreQueryParams: options.ignoreQueryParams ?? true,
      },
    );
    const isActive = createSignalFromSource(activeSource);

    createEffect(() => {
      element.classList.toggle(activeClassName, isActive());
    });
  }

  // Click handler
  function handleClick(evt: MouseEvent) {
    if (!shouldNavigate(evt)) {
      return;
    }

    // Symmetric with <Link> (#P0.6 audit): on an <a target="_blank"> the
    // browser opens the URL in a new tab/window natively. Intercepting the
    // click via preventDefault + router.navigate would suppress the new
    // tab and silently keep the user on the current page.
    if (anchor?.target === "_blank") {
      return;
    }

    if (anchor) {
      evt.preventDefault();
    }

    router
      .navigate(options.routeName, resolvedRouteParams, resolvedRouteOptions)
      .catch(() => {});
  }

  element.addEventListener("click", handleClick);

  onCleanup(() => {
    element.removeEventListener("click", handleClick);
  });
}
