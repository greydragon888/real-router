import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { createStressRouter, noop, settle } from "./helpers";

describe("S3: teardown in the middle of navigation", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("S3.1: unsubscribe() mid-transition does not log errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(noop);

    const { router, unsubscribe } = createStressRouter();

    try {
      await router.start("/");

      const navPromises: Promise<unknown>[] = [];

      for (let i = 0; i < 50; i++) {
        navPromises.push(
          router
            .navigate(i % 2 === 0 ? "users" : "settings")
            .catch((error: unknown) => {
              if (
                (error as { code?: string }).code !== "TRANSITION_CANCELLED"
              ) {
                throw error;
              }
            }),
        );

        if (i === 25) {
          unsubscribe();
        }
      }

      await Promise.allSettled(navPromises);
      await settle();

      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      router.stop();
      errorSpy.mockRestore();
    }
  });

  it("S3.2: back() fire-and-forget while teardown is imminent does not crash", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(noop);

    const { router, unsubscribe } = createStressRouter();

    try {
      await router.start("/");
      await router.navigate("users");
      await router.navigate("settings");

      expect(() => {
        router.back();
        unsubscribe();
      }).not.toThrow();

      await settle();

      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      router.stop();
      errorSpy.mockRestore();
    }
  });
});
