import type { ActionReturn } from "svelte/action";
import type { Router, Params, NavigationOptions } from "@real-router/core";
import { ROUTER_KEY, getContextOrThrow } from "../context";
import { EMPTY_OPTIONS, EMPTY_PARAMS, NOOP } from "../constants";
import { shouldNavigate, applyLinkA11y } from "../dom-utils";

export interface LinkActionParams {
  name: string;
  params?: Params;
  options?: NavigationOptions;
}

type LinkAction = (
  node: HTMLElement,
  params: LinkActionParams,
) => ActionReturn<LinkActionParams>;

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
export function createLinkAction(): LinkAction {
  const router = getContextOrThrow<Router>(ROUTER_KEY, "createLinkAction");

  return function link(
    node: HTMLElement,
    params: LinkActionParams,
  ): ActionReturn<LinkActionParams> {
    let currentParams = params;

    applyLinkA11y(node);

    function navigate() {
      router
        .navigate(
          currentParams.name,
          currentParams.params ?? EMPTY_PARAMS,
          currentParams.options ?? EMPTY_OPTIONS,
        )
        .catch(NOOP);
    }

    function handleClick(evt: MouseEvent) {
      if (!shouldNavigate(evt)) return;
      if (
        node instanceof HTMLAnchorElement &&
        node.getAttribute("target") === "_blank"
      ) {
        return;
      }
      evt.preventDefault();
      navigate();
    }

    function handleKeyDown(evt: KeyboardEvent) {
      if (evt.key === "Enter" && !(node instanceof HTMLButtonElement)) {
        navigate();
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
