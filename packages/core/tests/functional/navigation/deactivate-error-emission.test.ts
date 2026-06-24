import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

/**
 * A navigation blocked by a `canDeactivate` guard fails while the FSM is still
 * in TRANSITION_STARTED (deactivation runs before LEAVE_APPROVED). That FAIL
 * transition is what emits TRANSITION_ERROR — wired by the
 * `fsm.on(TRANSITION_STARTED, FAIL, () => this.#emitPendingError())` action in
 * EventBusNamespace. Emptying that action (a BlockStatement mutant) makes a
 * deactivation block silently swallow the error event while the navigate()
 * promise still rejects — so asserting the plugin hook fires is the precise
 * probe for the TRANSITION_STARTED+FAIL emission.
 */
describe("onTransitionError on canDeactivate block (FAIL from TRANSITION_STARTED)", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("emits onTransitionError when a canDeactivate guard blocks the navigation", async () => {
    const onTransitionError = vi.fn();

    router.usePlugin(() => ({ onTransitionError }));

    await router.navigate("users");

    getLifecycleApi(router).addDeactivateGuard("users", () => () => false);

    await expect(router.navigate("orders")).rejects.toMatchObject({
      code: errorCodes.CANNOT_DEACTIVATE,
    });

    expect(onTransitionError).toHaveBeenCalledTimes(1);
  });
});
