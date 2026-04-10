import { getContext } from "svelte";
import type { ActionReturn } from "svelte/action";
import type { Router, Params, NavigationOptions } from "@real-router/core";
import { ROUTER_KEY } from "../context";
import { shouldNavigate, applyLinkA11y } from "../dom-utils/index.js";

export interface LinkActionParams {
  name: string;
  params?: Params;
  options?: NavigationOptions;
}

/**
 * Factory function that captures router context during component initialization.
 * Must be called during component init (not inside event handlers or effects).
 *
 * @returns Action function for use with `use:` directive
 * @throws Error if called outside RouterProvider
 *
 * @example
 * ```svelte
 * <script>
 *   import { createLinkAction } from '@real-router/svelte';
 *   const link = createLinkAction();
 * </script>
 *
 * <button use:link={{ name: 'home' }}>Home</button>
 * <a use:link={{ name: 'users', params: { id: '123' } }}>User Profile</a>
 * ```
 */
export function createLinkAction(): (
  node: HTMLElement,
  params: LinkActionParams,
) => ActionReturn<LinkActionParams> {
  const router = getContext<Router | undefined>(ROUTER_KEY);

  if (!router) {
    throw new Error("createLinkAction must be called inside a RouterProvider");
  }

  return function link(
    node: HTMLElement,
    params: LinkActionParams,
  ): ActionReturn<LinkActionParams> {
    let currentParams = params;

    applyLinkA11y(node);

    function handleClick(evt: MouseEvent) {
      if (!shouldNavigate(evt)) return;
      evt.preventDefault();
      // router is guaranteed to exist due to check in factory
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      router!
        .navigate(
          currentParams.name,
          currentParams.params ?? {},
          currentParams.options ?? {},
        )
        .catch(() => {});
    }

    function handleKeyDown(evt: KeyboardEvent) {
      if (evt.key === "Enter" && !(node instanceof HTMLButtonElement)) {
        // router is guaranteed to exist due to check in factory
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        router!
          .navigate(
            currentParams.name,
            currentParams.params ?? {},
            currentParams.options ?? {},
          )
          .catch(() => {});
      }
    }

    node.addEventListener("click", handleClick);
    node.addEventListener("keydown", handleKeyDown);

    return {
      update(newParams: LinkActionParams) {
        currentParams = newParams;
      },
      destroy() {
        node.removeEventListener("click", handleClick);
        node.removeEventListener("keydown", handleKeyDown);
      },
    };
  };
}
