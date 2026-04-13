import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route, Router, State } from "@real-router/core";

// =============================================================================
// Memory helpers (pattern from packages/core/tests/stress/helpers.ts)
// =============================================================================

export function forceGC(): void {
  if (typeof globalThis.gc === "function") {
    globalThis.gc();
  }
}

export function getHeapUsedBytes(): number {
  return process.memoryUsage().heapUsed;
}

export function takeHeapSnapshot(): number {
  forceGC();

  return getHeapUsedBytes();
}

export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  const sign = bytes < 0 ? "-" : "";

  if (abs < 1024) {
    return `${sign}${abs} B`;
  }
  if (abs < 1024 * 1024) {
    return `${sign}${(abs / 1024).toFixed(1)} KB`;
  }

  return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB`;
}

export const MB = 1024 * 1024;

// =============================================================================
// Router helpers
// =============================================================================

export function createStressRouter(routes: Route[]): Router {
  const router = createRouter(routes, { defaultRoute: routes[0].name });
  const api = getPluginApi(router);

  api.extendRouter({
    matchUrl: (url: string): State | undefined => {
      try {
        const { pathname } = new URL(url);

        return api.matchPath(pathname);
      } catch {
        return undefined;
      }
    },
  });

  return router;
}

// =============================================================================
// DOM helpers
// =============================================================================

export function createAnchor(href: string): HTMLAnchorElement {
  const anchor = document.createElement("a");

  anchor.href = href;
  document.body.append(anchor);

  return anchor;
}

export function createAnchors(hrefs: string[]): HTMLAnchorElement[] {
  return hrefs.map((href) => createAnchor(href));
}

export function cleanupDOM(): void {
  document.body.innerHTML = "";
}

// =============================================================================
// Event helpers
// =============================================================================

export function fireMouseOver(target: Element): void {
  target.dispatchEvent(
    new MouseEvent("mouseover", { bubbles: true, cancelable: true }),
  );
}

export function fireTouchStart(target: Element, clientY = 0): void {
  const touch = new Touch({ identifier: 1, target, clientY, clientX: 0 });

  target.dispatchEvent(
    new TouchEvent("touchstart", {
      touches: [touch],
      bubbles: true,
      cancelable: true,
    }),
  );
}

export function fireTouchMove(target: Element, clientY = 0): void {
  const touch = new Touch({ identifier: 1, target, clientY, clientX: 0 });

  target.dispatchEvent(
    new TouchEvent("touchmove", {
      touches: [touch],
      bubbles: true,
      cancelable: true,
    }),
  );
}

export const noop = (): void => undefined;
