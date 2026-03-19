import { shouldNavigate } from "../utils";

import type { Router, NavigationOptions, Params } from "@real-router/core";
import type { Directive } from "vue";

export interface LinkDirectiveValue {
  name: string;
  params?: Params;
  options?: NavigationOptions;
}

let _router: Router | null = null;

export function setDirectiveRouter(router: Router): void {
  _router = router;
}

export function getDirectiveRouter(): Router {
  if (!_router) {
    /* v8 ignore next 3 -- @preserve Defensive: router always initialized by RouterProvider */
    throw new Error(
      "v-link directive requires a RouterProvider ancestor. Make sure RouterProvider is mounted.",
    );
  }

  return _router;
}

const clickHandlers = new WeakMap<HTMLElement, (evt: MouseEvent) => void>();
const keydownHandlers = new WeakMap<
  HTMLElement,
  (evt: KeyboardEvent) => void
>();

function createClickHandler(
  router: Router,
  value: LinkDirectiveValue,
): (evt: MouseEvent) => void {
  return (evt: MouseEvent) => {
    if (!shouldNavigate(evt)) {
      return;
    }

    evt.preventDefault();
    router
      .navigate(value.name, value.params ?? {}, value.options ?? {})
      .catch(() => {});
  };
}

function createKeydownHandler(
  router: Router,
  value: LinkDirectiveValue,
  el: HTMLElement,
): (evt: KeyboardEvent) => void {
  return (evt: KeyboardEvent) => {
    if (evt.key === "Enter" && !(el instanceof HTMLButtonElement)) {
      router
        .navigate(value.name, value.params ?? {}, value.options ?? {})
        .catch(() => {});
    }
  };
}

function attachHandlers(
  el: HTMLElement,
  router: Router,
  value: LinkDirectiveValue,
): void {
  const handleClick = createClickHandler(router, value);
  const handleKeyDown = createKeydownHandler(router, value, el);

  el.addEventListener("click", handleClick);
  el.addEventListener("keydown", handleKeyDown);

  clickHandlers.set(el, handleClick);
  keydownHandlers.set(el, handleKeyDown);
}

function detachHandlers(el: HTMLElement): void {
  const clickHandler = clickHandlers.get(el);
  const keydownHandler = keydownHandlers.get(el);

  if (clickHandler) {
    el.removeEventListener("click", clickHandler);
  }
  if (keydownHandler) {
    el.removeEventListener("keydown", keydownHandler);
  }

  clickHandlers.delete(el);
  keydownHandlers.delete(el);
}

export const vLink: Directive<HTMLElement, LinkDirectiveValue> = {
  mounted(el, binding) {
    const router = getDirectiveRouter();

    if (
      !(el instanceof HTMLAnchorElement) &&
      !(el instanceof HTMLButtonElement)
    ) {
      if (!el.getAttribute("role")) {
        el.setAttribute("role", "link");
      }
      if (!el.getAttribute("tabindex")) {
        el.setAttribute("tabindex", "0");
      }
    }

    el.style.cursor = "pointer";

    attachHandlers(el, router, binding.value);
  },

  updated(el, binding) {
    const router = getDirectiveRouter();

    detachHandlers(el);
    attachHandlers(el, router, binding.value);
  },

  beforeUnmount(el) {
    detachHandlers(el);
  },
};
