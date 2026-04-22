import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { createStressRouter, noop, settle } from "./helpers";

describe("S11: back() in flight + immediate navigate() race", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S11.1: back() cancelled by immediate navigate() — next push is recorded", async () => {
    const { router, unsubscribe } = createStressRouter();

    try {
      await router.start("/");
      await router.navigate("users");
      await router.navigate("settings");

      // History: [home, users, settings], index=2.
      router.back(); // targets "users" — fires navigate("users", ..., {replace:true})
      // Before back() settles, fire a real push:
      await router.navigate("profile").catch((error: unknown) => {
        // TRANSITION_CANCELLED may be thrown depending on timing of the
        // back() navigation — both paths are acceptable.
        if ((error as { code?: string }).code !== "TRANSITION_CANCELLED") {
          throw error;
        }
      });

      await settle();

      // The profile push must have taken effect — otherwise the plugin got
      // stuck with #navigatingFromHistory=true and skipped the push.
      expect(router.getState()?.name).toBe("profile");
      expect(router.canGoBack()).toBe(true);

      // Verify follow-up navigation also records normally (flag not stuck).
      await router.navigate("users");

      expect(router.getState()?.name).toBe("users");
      expect(router.canGoBack()).toBe(true);
    } finally {
      router.stop();
      unsubscribe();
    }
  });

  it("S11.2: 20 interleaved back() + navigate() cycles do not leak #navigatingFromHistory", async () => {
    const { router, unsubscribe } = createStressRouter();
    const ignoredCodes = new Set(["TRANSITION_CANCELLED", "SAME_STATES"]);

    try {
      await router.start("/");
      await router.navigate("users");
      await router.navigate("user", { id: "1" });
      await router.navigate("settings");

      for (let i = 0; i < 20; i++) {
        router.back();
        // Alternate targets so we don't hit SAME_STATES on every iteration.
        const target = i % 2 === 0 ? "profile" : "settings";

        await router
          .navigate(target, {}, { replace: true })
          .catch((error: unknown) => {
            const code = (error as { code?: string }).code;

            if (code === undefined || !ignoredCodes.has(code)) {
              throw error;
            }
          });
      }

      await settle();

      // Router must remain responsive — if #navigatingFromHistory leaked to
      // true, subsequent onTransitionSuccess calls would have silently skipped
      // recording. Drive one more explicit push and verify it landed.
      await router.navigate("users");

      expect(router.getState()?.name).toBe("users");
      expect(router.canGoBack()).toBe(true);
    } finally {
      router.stop();
      unsubscribe();
    }
  });
});
