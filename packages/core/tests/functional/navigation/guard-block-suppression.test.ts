import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";
import type { LifecycleApi } from "@real-router/core/api";

/**
 * A guard returning `false` (or a guard-blocked traversal from a plugin's
 * `back()`/`forward()`) is an EXPECTED navigation outcome, not an internal
 * bug. Fire-and-forget calls must not trip the unhandled-rejection safety
 * net's `logger.error("router.navigate", "Unexpected navigation error", …)`
 * for `CANNOT_ACTIVATE` / `CANNOT_DEACTIVATE` — that noise is what the
 * memory-plugin `back()` audit surfaced under #721.
 */
const UNEXPECTED_ERROR_LOG = [
  "router.navigate",
  "Unexpected navigation error",
] as const;

let router: Router;
let lifecycle: LifecycleApi;

describe("fire-and-forget guard-block suppression (#721)", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
    lifecycle = getLifecycleApi(router);
  });

  afterEach(() => {
    router.stop();
    vi.restoreAllMocks();
  });

  it("does not log an unexpected-error when a canActivate guard blocks fire-and-forget navigate()", async () => {
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    // `admin-protected` is defined with `canActivate: () => () => false`.
    void router.navigate("admin-protected");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(errorSpy).not.toHaveBeenCalledWith(
      ...UNEXPECTED_ERROR_LOG,
      expect.anything(),
    );
  });

  it("does not log an unexpected-error when a canDeactivate guard blocks fire-and-forget navigate()", async () => {
    lifecycle.addDeactivateGuard("home", () => () => false);
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    void router.navigate("users");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(errorSpy).not.toHaveBeenCalledWith(
      ...UNEXPECTED_ERROR_LOG,
      expect.anything(),
    );
  });

  it("does not log an unexpected-error when a guard blocks fire-and-forget navigateToState()", async () => {
    lifecycle.addActivateGuard("users", () => () => false);
    const matched = getPluginApi(router).matchPath("/users");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    void getPluginApi(router).navigateToState(matched!);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(errorSpy).not.toHaveBeenCalledWith(
      ...UNEXPECTED_ERROR_LOG,
      expect.anything(),
    );
  });
});
