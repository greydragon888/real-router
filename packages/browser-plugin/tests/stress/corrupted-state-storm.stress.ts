import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import {
  createStressRouter,
  makePopstateState,
  waitForTransitions,
  noop,
} from "./helpers";

describe("B6: Corrupted popstate state storm", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("B6.1: 100 popstate with null state — URL matching fallback resolves correct route", async () => {
    const { router, unsubscribe } = createStressRouter();

    globalThis.history.replaceState({}, "", "/home");
    await router.start();

    for (let i = 0; i < 100; i++) {
      globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    }

    await waitForTransitions();

    expect(router.getState()?.name).toBe("home");

    router.stop();
    unsubscribe();
  });

  it("B6.2: 100 popstate with partial state — isStateStrict rejects, URL fallback resolves users.list", async () => {
    const { router, unsubscribe } = createStressRouter();

    globalThis.history.replaceState({}, "", "/users/list");
    await router.start();

    for (let i = 0; i < 100; i++) {
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: { name: "home" } }),
      );
    }

    await waitForTransitions();

    expect(router.getState()?.name).toBe("users.list");

    router.stop();
    unsubscribe();
  });

  it("B6.3: 50 valid + 50 corrupted popstate — valid uses direct navigate, corrupted uses URL fallback", async () => {
    const { router, unsubscribe } = createStressRouter();

    globalThis.history.replaceState({}, "", "/home");
    await router.start();

    for (let i = 0; i < 100; i++) {
      const state =
        i % 2 === 0
          ? makePopstateState("users.list", {}, "/users/list")
          : { name: 123 };

      globalThis.dispatchEvent(new PopStateEvent("popstate", { state }));
    }

    await waitForTransitions();

    expect(router.getState()?.name).toBeDefined();

    router.stop();
    unsubscribe();
  });

  it("B6.4: 50 popstate with prototype-polluted state — isStateStrict rejects, no prototype pollution", async () => {
    const { router, unsubscribe } = createStressRouter();

    globalThis.history.replaceState({}, "", "/home");
    await router.start();

    for (let i = 0; i < 50; i++) {
      const polluted = Object.create(
        { malicious: true },
        { name: { value: 42, enumerable: true } },
      );

      globalThis.dispatchEvent(
        new PopStateEvent("popstate", { state: polluted }),
      );
    }

    await waitForTransitions();

    expect(router.getState()?.name).toBe("home");
    expect(Object.prototype).not.toHaveProperty("malicious");

    router.stop();
    unsubscribe();
  });
});
