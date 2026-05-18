import { getLifecycleApi } from "@real-router/core/api";

import type { Router, State } from "@real-router/core";

function hasUnsavedDraft(fromState: State | null | undefined): boolean {
  const rawId = fromState?.params.id;
  const id = typeof rawId === "string" ? rawId : "";

  if (!id) {
    return false;
  }

  const draft = sessionStorage.getItem(`draft:product:${id}`);

  return draft !== null && draft !== "";
}

export function installConfirmLeaveGuard(router: Router): void {
  const lifecycle = getLifecycleApi(router);

  lifecycle.addDeactivateGuard(
    "products.product.edit",
    () => (toState, fromState) => {
      const meta = toState.context.navigation;

      if (!meta?.userInitiated) {
        return true;
      }

      if (!hasUnsavedDraft(fromState)) {
        return true;
      }

      return globalThis.confirm("Leave without saving? Changes will be lost.");
    },
  );
}
