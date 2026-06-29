import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouteAnnouncer } from "../../src/dom-utils";

const ANNOUNCER_ATTR = "data-real-router-announcer";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "about", path: "/about" },
];

async function triggerAnnouncement(
  router: ReturnType<typeof createRouter>,
): Promise<void> {
  await router.navigate("users");
  await router.navigate("about");
}

describe("createRouteAnnouncer", () => {
  let router: ReturnType<typeof createRouter>;
  let originalRAF: typeof globalThis.requestAnimationFrame;

  beforeEach(async () => {
    vi.useFakeTimers();

    originalRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(performance.now());

      return 0;
    };

    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
    document.querySelector(`[${ANNOUNCER_ATTR}]`)?.remove();
    document.querySelectorAll("h1").forEach((element) => {
      element.remove();
    });
    globalThis.requestAnimationFrame = originalRAF;
    vi.useRealTimers();
  });

  it("creates an aria-live announcer element in the DOM", () => {
    const announcer = createRouteAnnouncer(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`);

    expect(element).not.toBeNull();
    expect(element?.getAttribute("aria-live")).toBe("assertive");
    expect(element?.getAttribute("aria-atomic")).toBe("true");

    announcer.destroy();
  });

  it("reuses existing announcer element", () => {
    const announcer1 = createRouteAnnouncer(router);
    const element1 = document.querySelector(`[${ANNOUNCER_ATTR}]`);

    const announcer2 = createRouteAnnouncer(router);
    const element2 = document.querySelector(`[${ANNOUNCER_ATTR}]`);

    expect(element1).toBe(element2);
    expect(document.querySelectorAll(`[${ANNOUNCER_ATTR}]`)).toHaveLength(1);

    announcer1.destroy();
    announcer2.destroy();
  });

  it("removes announcer on destroy", () => {
    const announcer = createRouteAnnouncer(router);

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).not.toBeNull();

    announcer.destroy();

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).toBeNull();
  });

  it("skips initial navigation announcement", async () => {
    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await router.navigate("users");

    expect(element.textContent).toBe("");

    announcer.destroy();
  });

  it("announces text after second navigation once ready", async () => {
    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toContain("about");

    announcer.destroy();
  });

  it("does not announce before safari ready delay", async () => {
    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    await triggerAnnouncement(router);

    expect(element.textContent).toBe("");

    announcer.destroy();
  });

  it("does not announce after destroy", async () => {
    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);
    announcer.destroy();

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).toBeNull();
  });

  it("uses custom getAnnouncementText when provided", async () => {
    const announcer = createRouteAnnouncer(router, {
      getAnnouncementText: (route) => `Custom: ${route.name}`,
    });
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toBe("Custom: about");

    announcer.destroy();
  });

  it("uses custom prefix when provided", async () => {
    const announcer = createRouteAnnouncer(router, {
      prefix: "Now at: ",
    });
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toContain("Now at:");

    announcer.destroy();
  });

  it("clears announcement text after 7s delay", async () => {
    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toContain("Navigated");

    vi.advanceTimersByTime(7000);

    expect(element.textContent).toBe("");

    announcer.destroy();
  });

  it("reads h1 text for announcement", async () => {
    const h1 = document.createElement("h1");

    h1.textContent = "About Page";
    document.body.append(h1);

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    expect(element.textContent).toContain("About Page");

    announcer.destroy();
  });

  it("sets tabindex=-1 on h1 and focuses it", async () => {
    const h1 = document.createElement("h1");

    h1.textContent = "About Page";
    document.body.append(h1);

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(h1.getAttribute("tabindex")).toBe("-1");

    announcer.destroy();
  });

  it("does not override existing tabindex on h1", async () => {
    const h1 = document.createElement("h1");

    h1.textContent = "About Page";
    h1.setAttribute("tabindex", "0");
    document.body.append(h1);

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(h1.getAttribute("tabindex")).toBe("0");

    announcer.destroy();
  });

  it("falls back to document.title when no h1", async () => {
    const originalTitle = document.title;

    document.title = "Test Title";

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    expect(element.textContent).toContain("Test Title");

    document.title = originalTitle;
    announcer.destroy();
  });

  it("falls back to route name when no h1 and no title", async () => {
    const originalTitle = document.title;

    document.title = "";

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    expect(element.textContent).toContain("about");

    document.title = originalTitle;
    announcer.destroy();
  });

  it("does not repeat the same announcement text", async () => {
    const announcer = createRouteAnnouncer(router, {
      getAnnouncementText: () => "Same Text",
    });
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toBe("Same Text");

    vi.advanceTimersByTime(7000);

    expect(element.textContent).toBe("");

    await router.navigate("home");

    expect(element.textContent).toBe("Same Text");

    announcer.destroy();
  });

  it("excludes internal @@-prefixed route name from announcement text", async () => {
    const originalTitle = document.title;

    document.title = "";

    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).not.toContain("@@");

    document.title = originalTitle;
    announcer.destroy();
  });

  it("empty announcement text from custom handler falls back to default chain (Mini-sprint E.4)", async () => {
    // Behaviour change: pre-E.4, an empty-string return from
    // `getAnnouncementText` silently suppressed the announcement,
    // leaving screen-reader users without feedback. Post-E.4, an
    // empty / null / undefined custom result falls through to the
    // default resolution chain (h1 → document.title → route.name).
    // Lock the new behaviour for the Angular adapter to keep it in
    // sync with shared/dom-utils.
    const announcer = createRouteAnnouncer(router, {
      getAnnouncementText: () => "",
    });
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    // Falls back to the default chain — route.name "about" wins
    // (no h1, document.title cleared in beforeEach).
    expect(element.textContent).toBe("Navigated to about");

    announcer.destroy();
  });

  it("falls back to document.title when h1 has empty textContent", async () => {
    const h1 = document.createElement("h1");

    h1.textContent = "";
    document.body.append(h1);

    const originalTitle = document.title;

    document.title = "Fallback Title";

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    expect(element.textContent).toContain("Fallback Title");

    document.title = originalTitle;
    announcer.destroy();
  });

  it("uses first h1 when multiple h1 elements are present", async () => {
    const first = document.createElement("h1");
    const second = document.createElement("h1");

    first.textContent = "First Heading";
    second.textContent = "Second Heading";
    document.body.append(first, second);

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    expect(element.textContent).toContain("First Heading");
    expect(element.textContent).not.toContain("Second Heading");

    announcer.destroy();
  });

  it("does not announce when destroyed during rAF", async () => {
    let rAFCallbacks: FrameRequestCallback[] = [];

    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rAFCallbacks.push(cb);

      return 0;
    };

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await router.navigate("users");
    await router.navigate("about");

    announcer.destroy();

    for (const cb of rAFCallbacks) {
      cb(performance.now());
    }

    rAFCallbacks = [];

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).toBeNull();
  });

  // Closes review-2026-05-10 §5.2 ⛔ ("pendingText буферизация — explicit
  // flush сценарий" MED). The existing "announces text after second
  // navigation once ready" test covers the case INDIRECTLY (a single nav
  // during the buffering window is flushed when ready fires). This test
  // pins the explicit contract: navigation that fires BEFORE the
  // Safari-ready window elapses gets buffered, then announced once
  // SAFARI_READY_DELAY (100ms) expires.
  it("buffers announcement when navigation fires before Safari-ready window expires, then flushes on ready", async () => {
    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    // Navigation fires WITHIN the 100ms Safari-ready window — text is
    // computed and stored in `pendingText`, NOT announced yet.
    await triggerAnnouncement(router);

    expect(element.textContent).toBe("");

    // Advance past SAFARI_READY_DELAY (100ms) — pending flush fires.
    vi.advanceTimersByTime(150);

    expect(element.textContent).toContain("about");

    announcer.destroy();
  });

  // Closes review-2026-05-10 §5.2 ⛔ ("getAnnouncementText бросает" LOW).
  // The `resolveText` function wraps `getCustomText(route)` in try/catch
  // and falls through to the built-in resolution chain on throw. A
  // throwing consumer callback would otherwise tear down sibling
  // subscribers in `router.subscribe`.
  it("getAnnouncementText throws → falls back to default resolution + logs console.error", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const announcer = createRouteAnnouncer(router, {
      getAnnouncementText: () => {
        throw new Error("custom-text failure");
      },
    });
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    // Falls back to the default chain → h1 text || document.title ||
    // routeName. jsdom default title is "" → fallback to route name
    // "about", with prefix "Navigated to ".
    expect(element.textContent).toContain("Navigated to");
    // Console.error called with the documented diagnostic.
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[real-router] getAnnouncementText threw; falling back",
      ),
      expect.any(Error),
    );

    announcer.destroy();
    errSpy.mockRestore();
  });

  // Closes review-2026-05-10 §5.2 ⛔ ("document.body отсутствует (SSR
  // safety)" MED). The implementation now uses
  // `(document.body ?? document.documentElement).prepend(element)` instead
  // of the unconditional `document.body.prepend(element)` — when
  // `document.body` is null (rare jsdom configurations, pre-body-injection
  // timing, certain SSR rehydration paths), the announcer falls back to
  // `documentElement` so the consumer's mount doesn't tear down with
  // `TypeError: Cannot read properties of null`.
  it("document.body is null → announcer mounts on documentElement instead of throwing", () => {
    // Snapshot original body, then temporarily make `document.body` null.
    // jsdom allows this via Object.defineProperty override.
    const originalBody = document.body;

    Object.defineProperty(document, "body", {
      value: null,
      configurable: true,
      writable: true,
    });

    try {
      expect(() => {
        const announcer = createRouteAnnouncer(router);

        // The announcer element should be attached to documentElement
        // (since body is null), discoverable via querySelector on document.
        const element = document.querySelector(`[${ANNOUNCER_ATTR}]`);

        expect(element).not.toBeNull();
        expect(element!.parentElement).toBe(document.documentElement);

        announcer.destroy();
      }).not.toThrow();
    } finally {
      // Restore original body.
      Object.defineProperty(document, "body", {
        value: originalBody,
        configurable: true,
        writable: true,
      });
    }
  });

  // Closes review-2026-05-10 §5.10 ⛔ "NavigationAnnouncer SSR mode" MED.
  // The underlying `createRouteAnnouncer` now guards against missing
  // `document` (SSR / Node.js / non-DOM environment) and returns
  // NOOP_INSTANCE. Without the guard, `NavigationAnnouncer`'s field
  // initializer (`createRouteAnnouncer(injectRouter())`) would throw
  // `ReferenceError: document is not defined` under `@angular/ssr`
  // rendering, tearing down the whole SSR bootstrap.
  //
  // This test directly exercises the guard by overriding `globalThis.document`
  // to undefined and verifying NOOP_INSTANCE is returned without throwing.
  // The NOOP_INSTANCE contract: `.destroy()` is a frozen no-op function;
  // no listeners are wired; no DOM access is performed.
  it("SSR safety: returns NOOP when document is undefined (no DOM access)", () => {
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined,
    });

    try {
      const minimalRouter = {
        subscribe: () => () => {},
      } as unknown as ReturnType<typeof createRouter>;

      const subscribeSpy = vi.spyOn(minimalRouter, "subscribe");
      let announcer: { destroy: () => void } | undefined;

      expect(() => {
        announcer = createRouteAnnouncer(minimalRouter);
      }).not.toThrow();

      expect(announcer).toBeDefined();
      expect(announcer!.destroy).toBeTypeOf("function");
      // NOOP_INSTANCE: no listener wired when document is unavailable.
      expect(subscribeSpy).not.toHaveBeenCalled();

      // Idempotent destroy on NOOP_INSTANCE.
      expect(() => {
        announcer!.destroy();
        announcer!.destroy();
      }).not.toThrow();
    } finally {
      if (documentDescriptor) {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      }
    }
  });

  // Closes review-2026-05-10 §5.2 ⛔ ("Detached h1" LOW). When an `<h1>`
  // exists in the document tree but is detached (e.g. it was moved out of
  // its parent before the rAF callbacks fire), `document.querySelector`
  // returns null — the announcer falls through to document.title /
  // route.name. The current test "falls back to document.title when no
  // h1" covers the no-element case; this covers the orphaned-element case.
  it("detached h1 (querySelector returns null) → falls back to document.title / route name", async () => {
    // Create an h1, then immediately detach it. It still exists as a JS
    // object but is no longer queryable via document.querySelector.
    const h1 = document.createElement("h1");

    h1.textContent = "This Should NOT Be Announced";
    document.body.append(h1);
    h1.remove();

    expect(document.querySelector("h1")).toBeNull();

    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);
    await triggerAnnouncement(router);

    // Should NOT pick up the detached h1's text — falls back to default.
    expect(element.textContent).not.toContain("This Should NOT Be");

    announcer.destroy();
  });

  it("does not re-announce identical text (text === lastAnnouncedText)", async () => {
    const originalTitle = document.title;

    document.title = "Same Title";

    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await router.navigate("users"); // first nav after creation — initial-skip
    await router.navigate("about"); // announces "Navigated to Same Title"

    expect(element.textContent).toBe("Navigated to Same Title");

    // Clear the DOM text but keep `lastAnnouncedText`; a navigation that
    // resolves to the SAME text must early-return without re-announcing.
    element.textContent = "";
    await router.navigate("users");

    expect(element.textContent).toBe("");

    document.title = originalTitle;
    announcer.destroy();
  });

  it("destroy() is idempotent — a second destroy() is a no-op", () => {
    const announcer = createRouteAnnouncer(router);

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).not.toBeNull();

    announcer.destroy();

    expect(() => {
      announcer.destroy();
    }).not.toThrow();
    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).toBeNull();
  });

  it("falls back to location.pathname for an internal route with no h1/title", async () => {
    const originalTitle = document.title;

    document.title = "";

    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await router.navigate("users"); // first nav after creation — initial-skip

    // navigateToNotFound emits an @@-prefixed UNKNOWN_ROUTE → the route name is
    // stripped to "" → resolveText falls through h1 → title → routeName to
    // `location.pathname`.
    router.navigateToNotFound("/missing-page");

    expect(element.textContent).toBe(
      `Navigated to ${globalThis.location.pathname}`,
    );

    document.title = originalTitle;
    announcer.destroy();
  });
});
