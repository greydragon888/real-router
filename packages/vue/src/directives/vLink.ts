import { shouldNavigate, applyLinkA11y } from "../dom-utils";

import type { Router, NavigationOptions, Params } from "@real-router/core";
import type { Directive } from "vue";

export interface LinkDirectiveValue {
  name: string;
  params?: Params;
  options?: NavigationOptions;
}

/**
 * Router stack for nested RouterProviders. The active router is the top of
 * the stack. RouterProvider pushes its router on mount and pops it on unmount,
 * which preserves the parent context when an inner provider tears down.
 *
 * Without the stack, an unmounted child provider would leave the directive
 * pointing at a disposed router, and v-link in the still-mounted parent would
 * navigate via the wrong (or torn-down) instance.
 */
const routerStack: Router[] = [];

/**
 * Pushes a router onto the active stack. Returns a release function that
 * removes that exact router from the stack regardless of position — safe
 * across out-of-order provider unmount sequences.
 *
 * @internal Used by RouterProvider during setup/teardown.
 */
export function pushDirectiveRouter(router: Router): () => void {
  routerStack.push(router);

  return () => {
    const idx = routerStack.lastIndexOf(router);

    if (idx !== -1) {
      routerStack.splice(idx, 1);
    }
  };
}

/**
 * Backwards-compatible alias. Replaces the active router unconditionally and
 * does NOT participate in the stack — use {@link pushDirectiveRouter} from
 * provider code instead. Kept for tests and direct callers.
 */
export function setDirectiveRouter(router: Router | null): void {
  if (router === null) {
    routerStack.length = 0;

    return;
  }
  if (routerStack.length === 0) {
    routerStack.push(router);

    return;
  }

  routerStack[routerStack.length - 1] = router;
}

export function getDirectiveRouter(): Router {
  const top = routerStack.at(-1);

  if (!top) {
    throw new Error(
      "v-link directive requires a RouterProvider ancestor. Make sure RouterProvider is mounted.",
    );
  }

  return top;
}

interface Handlers {
  click: (evt: MouseEvent) => void;
  keydown: (evt: KeyboardEvent) => void;
}

// Single WeakMap halves per-element bookkeeping vs two parallel maps.
const handlers = new WeakMap<HTMLElement, Handlers>();

/**
 * Validates a directive binding value before attaching handlers.
 * Returns false (and warns once per call) when the value is missing or
 * has no `name` — silently doing nothing is preferable to a runtime crash
 * inside a click handler.
 */
function isValidBinding(value: unknown): value is LinkDirectiveValue {
  if (value === null || value === undefined) {
    console.error(
      "[real-router] v-link directive received null/undefined value. The element will not be wired for navigation.",
    );

    return false;
  }
  if (typeof (value as { name?: unknown }).name !== "string") {
    console.error(
      "[real-router] v-link directive value is missing a string `name` field. The element will not be wired for navigation.",
    );

    return false;
  }

  return true;
}

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
  const click = createClickHandler(router, value);
  const keydown = createKeydownHandler(router, value, element);

  element.addEventListener("click", click);
  element.addEventListener("keydown", keydown);

  handlers.set(element, { click, keydown });
}

function detachHandlers(element: HTMLElement): void {
  const entry = handlers.get(element);

  if (entry) {
    element.removeEventListener("click", entry.click);
    element.removeEventListener("keydown", entry.keydown);
    handlers.delete(element);
  }
}

export const vLink: Directive<HTMLElement, LinkDirectiveValue> = {
  mounted(element, binding) {
    const router = getDirectiveRouter();

    applyLinkA11y(element);

    element.style.cursor = "pointer";

    if (!isValidBinding(binding.value)) {
      return;
    }

    attachHandlers(element, router, binding.value);
  },

  updated(element, binding) {
    const router = getDirectiveRouter();

    detachHandlers(element);

    if (!isValidBinding(binding.value)) {
      return;
    }

    attachHandlers(element, router, binding.value);
  },

  beforeUnmount(element) {
    detachHandlers(element);
  },
};
