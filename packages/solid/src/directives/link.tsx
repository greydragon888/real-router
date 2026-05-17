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

  // Set href on <a> elements
  if (element instanceof HTMLAnchorElement) {
    const href = buildHref(
      router,
      options.routeName,
      options.routeParams ?? (EMPTY_PARAMS as P),
    );

    if (href === undefined) {
      element.removeAttribute("href");
    } else {
      element.href = href;
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
      options.routeParams ?? (EMPTY_PARAMS as P),
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

  // §8.1 audit fix (LOW #11) — hoist `routeParams`/`routeOptions` `??`
  // resolution out of the click handler. The directive accessor is read once
  // at init (documented "use:link Options Are Captured Once"), so these
  // defaults can be resolved here and reused across every click without
  // re-evaluating the `??` chain.
  const resolvedRouteParams = (options.routeParams ?? EMPTY_PARAMS) as P;
  const resolvedRouteOptions = options.routeOptions ?? EMPTY_OPTIONS;

  // Click handler
  function handleClick(evt: MouseEvent) {
    if (!shouldNavigate(evt)) {
      return;
    }
    if (element instanceof HTMLAnchorElement) {
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
