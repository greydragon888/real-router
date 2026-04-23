import { getLifecycleApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

export function installConfirmLeaveGuard(router: Router): void {
  const lifecycle = getLifecycleApi(router);

  lifecycle.addDeactivateGuard("products.product.edit", () => (toState) => {
    const meta = toState.context.navigation;

    if (!meta?.userInitiated) {
      return true;
    }

    return globalThis.confirm("Leave without saving? Changes will be lost.");
  });
}
