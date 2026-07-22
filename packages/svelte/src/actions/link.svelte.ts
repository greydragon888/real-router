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

// #1253 — the action delegates events instead of attaching per-node listeners.
// A per-router singleton registers one `click` + one `keydown` listener at
// `document`, shared by every `use:link` node; nodes register their params into
// a `WeakMap`, and the delegated handler walks up from the event target to the
// nearest registered node. Result: O(1) listeners for any number of links
// (was 2 per node) — mirroring sv-router's global click delegation and the
// per-router-singleton pattern of `createActiveNameSelector`.
//
// Ref-counted attach/detach (like the selector's lazy connect/disconnect): the
// two `document` listeners attach on the first registered node and detach on the
// last `destroy()`, so a stopped/disposed router stays GC-able — the listeners
// hold a `router` reference, and `delegationByRouter` keys the state weakly. The
// state itself stays cached for the router's lifetime (never deleted from the
// map) so every `createLinkAction()` for one router shares ONE delegation root.
interface DelegationState {
  register: (node: HTMLElement, params: LinkActionParams) => void;
  update: (node: HTMLElement, params: LinkActionParams) => void;
  unregister: (node: HTMLElement) => void;
}

const delegationByRouter = new WeakMap<Router, DelegationState>();

function findRegisteredNode(
  nodes: WeakMap<HTMLElement, LinkActionParams>,
  target: EventTarget | null,
): HTMLElement | undefined {
  let el = target instanceof HTMLElement ? target : null;

  while (el) {
    if (nodes.has(el)) {
      return el;
    }
    el = el.parentElement;
  }

  return undefined;
}

function getDelegation(router: Router): DelegationState {
  const cached = delegationByRouter.get(router);

  if (cached) {
    return cached;
  }

  const nodes = new WeakMap<HTMLElement, LinkActionParams>();
  let count = 0;

  function navigate(target: LinkActionParams): void {
    router
      .navigate(
        target.name,
        target.params ?? EMPTY_PARAMS,
        // Slot-shift (RFC-4 M2 / #1548): query channel at position 3 (unused —
        // Link query rides in params), options at position 4.
        undefined,
        target.options ?? EMPTY_OPTIONS,
      )
      .catch(NOOP);
  }

  function handleClick(evt: MouseEvent): void {
    if (!shouldNavigate(evt)) {
      return;
    }

    const node = findRegisteredNode(nodes, evt.target);

    if (!node) {
      return;
    }

    // Anchor `target="_blank"` opens a new tab — let the browser handle it.
    if (
      node instanceof HTMLAnchorElement &&
      node.getAttribute("target") === "_blank"
    ) {
      return;
    }

    evt.preventDefault();
    navigate(nodes.get(node)!);
  }

  function handleKeyDown(evt: KeyboardEvent): void {
    if (evt.key !== "Enter") {
      return;
    }

    const node = findRegisteredNode(nodes, evt.target);

    // Buttons activate on Enter natively (WAI-ARIA) — don't double-fire.
    if (!node || node instanceof HTMLButtonElement) {
      return;
    }

    navigate(nodes.get(node)!);
  }

  const state: DelegationState = {
    register(node, params) {
      nodes.set(node, params);

      if (count === 0) {
        document.addEventListener("click", handleClick);
        document.addEventListener("keydown", handleKeyDown);
      }

      count++;
    },
    update(node, params) {
      nodes.set(node, params);
    },
    unregister(node) {
      // Svelte calls an action's `destroy()` exactly once per node, so every
      // `register` is balanced by one `unregister` — no double-decrement guard
      // needed (mirrors the original per-node `removeEventListener` teardown).
      nodes.delete(node);
      count--;

      if (count === 0) {
        document.removeEventListener("click", handleClick);
        document.removeEventListener("keydown", handleKeyDown);
      }
    },
  };

  delegationByRouter.set(router, state);

  return state;
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
export function createLinkAction(): LinkAction {
  const router = getContextOrThrow<Router>(ROUTER_KEY, "createLinkAction");
  const delegation = getDelegation(router);

  return function link(
    node: HTMLElement,
    params: LinkActionParams,
  ): ActionReturn<LinkActionParams> {
    applyLinkA11y(node);
    delegation.register(node, params);

    return {
      update(newParams: LinkActionParams) {
        delegation.update(node, newParams);
      },
      destroy() {
        delegation.unregister(node);
      },
    };
  };
}
