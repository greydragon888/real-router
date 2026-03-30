import { createActiveRouteSource } from "@real-router/sources";
import { shouldNavigate, applyLinkA11y, buildHref } from "dom-utils";
import { createEffect, onCleanup } from "solid-js";

import { EMPTY_PARAMS, EMPTY_OPTIONS } from "../constants";
import { createSignalFromSource } from "../createSignalFromSource";
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

  // Active class tracking (reactive)
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

  // Click handler
  function handleClick(evt: MouseEvent) {
    if (!shouldNavigate(evt)) {
      return;
    }
    if (element instanceof HTMLAnchorElement) {
      evt.preventDefault();
    }

    router
      .navigate(
        options.routeName,
        options.routeParams ?? (EMPTY_PARAMS as P),
        options.routeOptions ?? EMPTY_OPTIONS,
      )
      .catch(() => {});
  }

  element.addEventListener("click", handleClick);

  onCleanup(() => {
    element.removeEventListener("click", handleClick);
  });
}
