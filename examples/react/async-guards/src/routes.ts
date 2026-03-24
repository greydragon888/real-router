import { cartState } from "./cart-state";
import { editorState } from "./editor-state";

import type { GuardFnFactory, Route } from "@real-router/core";

function checkoutGuardFn(
  _toState: unknown,
  _fromState: unknown,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(cartState.hasItems);
    }, 500);

    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

const checkoutGuard: GuardFnFactory = () => checkoutGuardFn;

function editorDeactivateGuardFn(): Promise<boolean> {
  if (!editorState.hasUnsaved) {
    return Promise.resolve(true);
  }

  return Promise.resolve(
    globalThis.confirm("You have unsaved changes. Leave the editor?"),
  );
}

const editorDeactivateGuard: GuardFnFactory = () => editorDeactivateGuardFn;

export const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "checkout", path: "/checkout", canActivate: checkoutGuard },
  { name: "editor", path: "/editor", canDeactivate: editorDeactivateGuard },
  { name: "about", path: "/about" },
];
