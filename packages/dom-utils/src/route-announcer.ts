import type { Router, State } from "@real-router/core";

const CLEAR_DELAY = 7000;
const SAFARI_READY_DELAY = 100;
const ANNOUNCER_ATTR = "data-real-router-announcer";

export interface RouteAnnouncerOptions {
  prefix?: string;
  getAnnouncementText?: (route: State) => string;
}

export function createRouteAnnouncer(
  router: Router,
  options?: RouteAnnouncerOptions,
): { destroy: () => void } {
  const prefix = options?.prefix ?? "Navigated to ";
  const getCustomText = options?.getAnnouncementText;

  let isInitialNavigation = true;
  let isReady = false;
  let lastAnnouncedText = "";
  let clearTimeoutId: ReturnType<typeof setTimeout> | undefined;

  const announcer = getOrCreateAnnouncer();

  const safariTimeoutId = setTimeout(() => {
    isReady = true;
  }, SAFARI_READY_DELAY);

  const unsubscribe = router.subscribe(({ route }) => {
    if (isInitialNavigation) {
      isInitialNavigation = false;

      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const text = resolveText(route, prefix, getCustomText);

        if (text && text !== lastAnnouncedText && isReady) {
          lastAnnouncedText = text;
          clearTimeout(clearTimeoutId);
          announcer.textContent = text;
          clearTimeoutId = setTimeout(() => {
            announcer.textContent = "";
          }, CLEAR_DELAY);
        }

        manageFocus();
      });
    });
  });

  return {
    destroy() {
      unsubscribe();
      clearTimeout(clearTimeoutId);
      clearTimeout(safariTimeoutId);
      removeAnnouncer();
    },
  };
}

function getOrCreateAnnouncer(): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`[${ANNOUNCER_ATTR}]`);

  if (existing) {
    return existing;
  }

  const wrapper = document.createElement("div");

  applyVisuallyHiddenStyles(wrapper);

  const region = document.createElement("div");

  region.setAttribute("aria-live", "assertive");
  region.setAttribute("aria-atomic", "true");
  region.setAttribute("role", "log");
  region.setAttribute(ANNOUNCER_ATTR, "");

  wrapper.append(region);
  document.body.prepend(wrapper);

  return region;
}

function removeAnnouncer(): void {
  const region = document.querySelector(`[${ANNOUNCER_ATTR}]`);

  region?.parentElement?.remove();
}

function resolveText(
  route: State,
  prefix: string,
  getCustomText?: (route: State) => string,
): string {
  if (getCustomText) {
    return getCustomText(route);
  }

  const h1 = document.querySelector<HTMLElement>("h1");
  const h1Text = h1 === null ? "" : h1.textContent.trim();
  const rawText = h1Text || document.title || route.name;

  return `${prefix}${rawText}`;
}

function manageFocus(): void {
  const h1 = document.querySelector<HTMLElement>("h1");

  if (!h1) {
    return;
  }

  if (!h1.hasAttribute("tabindex")) {
    h1.setAttribute("tabindex", "-1");
  }

  h1.focus({ preventScroll: true });
}

function applyVisuallyHiddenStyles(element: HTMLElement): void {
  Object.assign(element.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    border: "0",
  });
}
