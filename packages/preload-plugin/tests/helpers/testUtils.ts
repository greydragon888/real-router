import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route, State } from "@real-router/core";

export function createTestRouter(routes?: Route[]): {
  router: ReturnType<typeof createRouter>;
} {
  const defaultRoutes: Route[] = routes ?? [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    {
      name: "users",
      path: "/users",
      children: [{ name: "view", path: "/:id" }],
    },
  ];

  const router = createRouter(defaultRoutes, { defaultRoute: "home" });

  return { router };
}

export function setupMatchUrl(router: ReturnType<typeof createRouter>): void {
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
}

export function createAnchor(
  href: string,
  dataset?: Record<string, string>,
): HTMLAnchorElement {
  const anchor = document.createElement("a");

  anchor.href = href;

  if (dataset) {
    for (const [key, value] of Object.entries(dataset)) {
      anchor.dataset[key] = value;
    }
  }

  document.body.append(anchor);

  return anchor;
}

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

export async function waitForTimer(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}
