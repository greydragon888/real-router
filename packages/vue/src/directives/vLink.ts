import { shouldNavigate, applyLinkA11y } from "../dom-utils/index.js";

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
  element: HTMLElement,
): (evt: KeyboardEvent) => void {
  return (evt: KeyboardEvent) => {
    if (evt.key === "Enter" && !(element instanceof HTMLButtonElement)) {
      router
        .navigate(value.name, value.params ?? {}, value.options ?? {})
        .catch(() => {});
    }
  };
}

function attachHandlers(
  element: HTMLElement,
  router: Router,
  value: LinkDirectiveValue,
): void {
  const handleClick = createClickHandler(router, value);
  const handleKeyDown = createKeydownHandler(router, value, element);

  element.addEventListener("click", handleClick);
  element.addEventListener("keydown", handleKeyDown);

  clickHandlers.set(element, handleClick);
  keydownHandlers.set(element, handleKeyDown);
}

function detachHandlers(element: HTMLElement): void {
  const clickHandler = clickHandlers.get(element);
  const keydownHandler = keydownHandlers.get(element);

  if (clickHandler) {
    element.removeEventListener("click", clickHandler);
  }
  if (keydownHandler) {
    element.removeEventListener("keydown", keydownHandler);
  }

  clickHandlers.delete(element);
  keydownHandlers.delete(element);
}

export const vLink: Directive<HTMLElement, LinkDirectiveValue> = {
  mounted(element, binding) {
    const router = getDirectiveRouter();

    applyLinkA11y(element);

    element.style.cursor = "pointer";

    attachHandlers(element, router, binding.value);
  },

  updated(element, binding) {
    const router = getDirectiveRouter();

    detachHandlers(element);
    attachHandlers(element, router, binding.value);
  },

  beforeUnmount(element) {
    detachHandlers(element);
  },
};
