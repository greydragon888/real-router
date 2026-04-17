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

type BuildUrlFn = (name: string, params: Params) => string | undefined;

export function buildHref(
  router: Router,
  routeName: string,
  routeParams: Params,
): string | undefined {
  try {
    const buildUrl = router.buildUrl as BuildUrlFn | undefined;

    if (buildUrl) {
      const url = buildUrl(routeName, routeParams);

      if (url !== undefined) {
        return url;
      }
    }

    return router.buildPath(routeName, routeParams);
  } catch {
    console.error(
      `[real-router] Route "${routeName}" is not defined. The element will render without an href attribute.`,
    );

    return undefined;
  }
}

function parseTokens(value: string | undefined): string[] {
  return value ? (value.match(/\S+/g) ?? []) : [];
}

export function buildActiveClassName(
  isActive: boolean,
  activeClassName: string | undefined,
  baseClassName: string | undefined,
): string | undefined {
  if (isActive && activeClassName) {
    const activeTokens = parseTokens(activeClassName);

    if (activeTokens.length === 0) {
      return baseClassName ?? undefined;
    }
    if (!baseClassName) {
      return activeTokens.join(" ");
    }

    const baseTokens = parseTokens(baseClassName);
    const seen = new Set(baseTokens);

    for (const token of activeTokens) {
      if (!seen.has(token)) {
        seen.add(token);
        baseTokens.push(token);
      }
    }

    return baseTokens.join(" ");
  }

  return baseClassName ?? undefined;
}

export function shallowEqual(
  prev: object | undefined,
  next: object | undefined,
): boolean {
  if (Object.is(prev, next)) {
    return true;
  }
  if (!prev || !next) {
    return false;
  }

  const prevKeys = Object.keys(prev);

  if (prevKeys.length !== Object.keys(next).length) {
    return false;
  }

  const prevRecord = prev as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;

  for (const key of prevKeys) {
    if (!Object.is(prevRecord[key], nextRecord[key])) {
      return false;
    }
  }

  return true;
}

export function applyLinkA11y(element: HTMLElement | null | undefined): void {
  if (!element) {
    return;
  }
  if (
    element instanceof HTMLAnchorElement ||
    element instanceof HTMLButtonElement
  ) {
    return;
  }
  if (!element.hasAttribute("role")) {
    element.setAttribute("role", "link");
  }
  if (!element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "0");
  }
}
