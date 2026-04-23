import { createRouter, errorCodes } from "@real-router/core";
import { afterEach, describe, it, expect } from "vitest";

import { cartState } from "../src/cart-state";
import { editorState } from "../src/editor-state";
import { routes } from "../src/routes";

import type { Router } from "@real-router/core";

let router: Router;

afterEach(() => {
  router.stop();
  vi.useRealTimers();
});

describe("checkoutGuard — async canActivate with external state", () => {
  it("allows checkout when cart has items", async () => {
    router = createRouter(routes, { defaultRoute: "home" });
    await router.start("/");

    cartState.hasItems = true;
    vi.useFakeTimers();

    const navPromise = router.navigate("checkout");

    await vi.advanceTimersByTimeAsync(500);
    const state = await navPromise;

    expect(state.name).toBe("checkout");
  });

  it("rejects checkout when cart is empty", async () => {
    router = createRouter(routes, { defaultRoute: "home" });
    await router.start("/");

    cartState.hasItems = false;
    vi.useFakeTimers();

    const navPromise = router.navigate("checkout");

    await vi.advanceTimersByTimeAsync(500);

    await expect(navPromise).rejects.toMatchObject({
      code: errorCodes.CANNOT_ACTIVATE,
    });
    expect(router.getState()?.name).toBe("home");
  });
});

describe("editorDeactivateGuard — canDeactivate with mutable state", () => {
  it("blocks leaving editor when unsaved and confirm=false", async () => {
    router = createRouter(routes, { defaultRoute: "home" });
    await router.start("/editor");

    editorState.hasUnsaved = true;
    vi.spyOn(globalThis, "confirm").mockReturnValue(false);

    await expect(router.navigate("home")).rejects.toMatchObject({
      code: errorCodes.CANNOT_DEACTIVATE,
    });
    expect(router.getState()?.name).toBe("editor");
  });

  it("allows leaving editor when confirm=true", async () => {
    router = createRouter(routes, { defaultRoute: "home" });
    await router.start("/editor");

    editorState.hasUnsaved = true;
    vi.spyOn(globalThis, "confirm").mockReturnValue(true);

    const state = await router.navigate("home");

    expect(state.name).toBe("home");
  });

  it("allows leaving editor when no unsaved changes (no confirm)", async () => {
    router = createRouter(routes, { defaultRoute: "home" });
    await router.start("/editor");

    editorState.hasUnsaved = false;

    const confirmSpy = vi.spyOn(globalThis, "confirm");
    const state = await router.navigate("home");

    expect(state.name).toBe("home");
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe("Competing navigation — second cancels first", () => {
  it("cancels in-flight checkout guard when new navigation starts", async () => {
    router = createRouter(routes, { defaultRoute: "home" });
    await router.start("/");

    cartState.hasItems = true;
    vi.useFakeTimers();

    const firstNav = router.navigate("checkout");
    const secondNav = router.navigate("about");

    await vi.advanceTimersByTimeAsync(500);

    await expect(firstNav).rejects.toMatchObject({
      code: errorCodes.TRANSITION_CANCELLED,
    });
    expect((await secondNav).name).toBe("about");
    expect(router.getState()?.name).toBe("about");
  });
});
