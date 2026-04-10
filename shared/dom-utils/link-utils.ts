import type { Router, Params } from "@real-router/core";

export function shouldNavigate(evt: MouseEvent): boolean {
  return (
    evt.button === 0 &&
    !evt.metaKey &&
    !evt.altKey &&
    !evt.ctrlKey &&
    !evt.shiftKey
  );
}

type BuildUrlFn = (name: string, params: Params) => string;

export function buildHref(
  router: Router,
  routeName: string,
  routeParams: Params,
): string | undefined {
  try {
    const buildUrl = router.buildUrl as BuildUrlFn | undefined;

    if (buildUrl) {
      return buildUrl(routeName, routeParams);
    }

    return router.buildPath(routeName, routeParams);
  } catch {
    console.error(
      `[real-router] Route "${routeName}" is not defined. The element will render without an href attribute.`,
    );

    return undefined;
  }
}

export function buildActiveClassName(
  isActive: boolean,
  activeClassName: string | undefined,
  baseClassName: string | undefined,
): string | undefined {
  if (isActive && activeClassName) {
    return baseClassName
      ? `${baseClassName} ${activeClassName}`.trim()
      : activeClassName;
  }

  return baseClassName ?? undefined;
}

export function applyLinkA11y(element: HTMLElement): void {
  if (
    element instanceof HTMLAnchorElement ||
    element instanceof HTMLButtonElement
  ) {
    return;
  }
  if (!element.getAttribute("role")) {
    element.setAttribute("role", "link");
  }
  if (!element.getAttribute("tabindex")) {
    element.setAttribute("tabindex", "0");
  }
}
