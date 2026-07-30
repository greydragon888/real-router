import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createRouteAnnouncer } from "../../../src/dom-utils";

import type { RouteAnnouncerOptions } from "../../../src/dom-utils";
import type { Router } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "contact", path: "/contact" },
];

const ANNOUNCER_ATTR = "[data-real-router-announcer]";

function makeRouter(): Router {
  return createRouter(ROUTES);
}

function getAnnouncerElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>(ANNOUNCER_ATTR);
}

function setupAnnouncer(
  router: Router,
  options?: RouteAnnouncerOptions,
): { destroy: () => void } {
  return createRouteAnnouncer(router, options);
}

describe("createRouteAnnouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.title = "";
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("1 — creates [data-real-router-announcer] element inside document.body", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");

    const element = getAnnouncerElement();

    expect(element).not.toBeNull();
    expect(document.body.contains(element)).toBe(true);
    expect(element?.getAttribute("aria-live")).toBe("assertive");
    expect(element?.getAttribute("aria-atomic")).toBe("true");

    ann.destroy();
    router.stop();
  });

  it("2 — second createRouteAnnouncer reuses singleton, no duplicates", async () => {
    const r1 = makeRouter();
    const r2 = makeRouter();
    const ann1 = setupAnnouncer(r1);
    const ann2 = setupAnnouncer(r2);

    await r1.start("/");
    await r2.start("/");

    expect(document.querySelectorAll(ANNOUNCER_ATTR)).toHaveLength(1);

    ann1.destroy();
    ann2.destroy();
    r1.stop();
    r2.stop();
  });

  it("3 — announces navigation with default 'Navigated to ' prefix", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    document.title = "About Page";
    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe("Navigated to About Page");

    ann.destroy();
    router.stop();
  });

  it("4 — getAnnouncementText: empty string FALLS BACK to default chain; non-empty overrides fallbacks (Mini-sprint E.4)", async () => {
    // Mini-sprint E.4 (audit-5 §4.2 #4) — empty-string fallback.
    // Prior behaviour: a custom resolver returning `""` silently
    // suppressed the announcement, leaving screen-reader users with
    // no feedback for routes outside the consumer's map. Now an empty
    // / falsy custom result falls through to the default resolution
    // chain (h1 → document.title → route.name).
    const router = makeRouter();
    const ann = setupAnnouncer(router, {
      getAnnouncementText: (route) =>
        route.name === "about" ? "Custom: about" : "",
    });

    await router.start("/");
    vi.advanceTimersByTime(100);

    const h1 = document.createElement("h1");

    h1.textContent = "H1 Content";
    document.body.append(h1);
    document.title = "Title Content";

    // route="contact" → custom returns "" → falls through. h1 is
    // present, so the default chain announces the h1 text.
    await router.navigate("contact");

    expect(getAnnouncerElement()?.textContent).toBe("Navigated to H1 Content");

    // route="about" → custom returns "Custom: about" — non-empty
    // path wins, overriding the fallback chain.
    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe("Custom: about");

    ann.destroy();
    router.stop();
  });

  it("5 — text resolved from h1.textContent when h1 is present", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    const h1 = document.createElement("h1");

    h1.textContent = "Welcome to About";
    document.body.append(h1);
    document.title = "Should Not Be Used";

    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe(
      "Navigated to Welcome to About",
    );

    ann.destroy();
    router.stop();
  });

  it("6 — text resolved from document.title when no h1", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    document.title = "About Page Title";

    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe(
      "Navigated to About Page Title",
    );

    ann.destroy();
    router.stop();
  });

  it("7 — text resolved from route.name when no h1 and empty title", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    document.title = "";

    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe("Navigated to about");

    ann.destroy();
    router.stop();
  });

  it("8 — h1 with only whitespace falls through to document.title", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    const h1 = document.createElement("h1");

    h1.textContent = " ".repeat(3);
    document.body.append(h1);
    document.title = "About Title Fallback";

    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe(
      "Navigated to About Title Fallback",
    );

    ann.destroy();
    router.stop();
  });

  it("9 — custom prefix replaces the default 'Navigated to '", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router, { prefix: "Now on: " });

    await router.start("/");
    vi.advanceTimersByTime(100);

    document.title = "About";
    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe("Now on: About");

    ann.destroy();
    router.stop();
  });

  it("10 — skips initial navigation, no announcement on first subscribe call", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    vi.advanceTimersByTime(100);

    document.title = "Home";
    await router.start("/");

    expect(getAnnouncerElement()?.textContent).toBe("");

    ann.destroy();
    router.stop();
  });

  it("11 — auto-clears announcement text after 7 seconds", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    document.title = "About";
    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe("Navigated to About");

    vi.advanceTimersByTime(7000);

    expect(getAnnouncerElement()?.textContent).toBe("");

    ann.destroy();
    router.stop();
  });

  it("12 — deduplication: same text not re-announced after being cleared", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    document.title = "About Page";
    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe("Navigated to About Page");

    getAnnouncerElement()!.textContent = "";

    await router.navigate("about", {}, undefined, { reload: true });

    expect(getAnnouncerElement()?.textContent).toBe("");

    ann.destroy();
    router.stop();
  });

  it("13 — manageFocus: sets tabindex=-1 and focuses h1 with preventScroll", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    const h1 = document.createElement("h1");

    h1.textContent = "About";
    document.body.append(h1);
    const focusSpy = vi.spyOn(h1, "focus");

    await router.navigate("about");

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(h1.getAttribute("tabindex")).toBe("-1");

    ann.destroy();
    router.stop();
  });

  it("14 — manageFocus: does not overwrite existing tabindex on h1", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    const h1 = document.createElement("h1");

    h1.textContent = "About";
    h1.setAttribute("tabindex", "0");
    document.body.append(h1);

    await router.navigate("about");

    expect(h1.getAttribute("tabindex")).toBe("0");

    ann.destroy();
    router.stop();
  });

  it("15 — does not focus h1 during initial navigation", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    const h1 = document.createElement("h1");

    h1.textContent = "Home";
    document.body.append(h1);
    const focusSpy = vi.spyOn(h1, "focus");

    await router.start("/");

    expect(focusSpy).not.toHaveBeenCalled();

    ann.destroy();
    router.stop();
  });

  it("16 — destroy() removes singleton, unsubscribes, and clears timeouts", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    expect(getAnnouncerElement()).not.toBeNull();

    ann.destroy();

    expect(getAnnouncerElement()).toBeNull();

    document.title = "About";
    await router.navigate("about");

    expect(getAnnouncerElement()).toBeNull();

    router.stop();
  });

  it("17 — announces UNKNOWN_ROUTE (navigateToNotFound) navigations", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    document.title = "Page Not Found";
    router.navigateToNotFound("/missing-page");

    expect(getAnnouncerElement()?.textContent).toBe(
      "Navigated to Page Not Found",
    );

    ann.destroy();
    router.stop();
  });

  it("18 — safari delay: no announcement within first 100ms after creation", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");

    document.title = "About";
    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe("");

    vi.advanceTimersByTime(100);

    document.title = "Contact";
    await router.navigate("contact");

    expect(getAnnouncerElement()?.textContent).toBe("Navigated to Contact");

    ann.destroy();
    router.stop();
  });

  it("19 — resolveText uses location.pathname as last fallback (no h1, no title, internal route filtered)", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    document.title = "";
    router.navigateToNotFound("/missing-page");

    expect(getAnnouncerElement()?.textContent).toBe(
      `Navigated to ${location.pathname}`,
    );

    ann.destroy();
    router.stop();
  });

  it("20 — manageFocus NOT called when announcement text is deduplicated", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    const h1 = document.createElement("h1");

    h1.textContent = "About";
    document.body.append(h1);
    const focusSpy = vi.spyOn(h1, "focus");

    await router.navigate("about");

    expect(focusSpy).toHaveBeenCalledTimes(1);

    await router.navigate("about", {}, undefined, { reload: true });

    expect(focusSpy).toHaveBeenCalledTimes(1);

    ann.destroy();
    router.stop();
  });

  it("21 — manageFocus NOT called during Safari delay (isReady=false)", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");

    const h1 = document.createElement("h1");

    h1.textContent = "About";
    document.body.append(h1);
    const focusSpy = vi.spyOn(h1, "focus");

    document.title = "About";
    await router.navigate("about");

    expect(focusSpy).not.toHaveBeenCalled();
    expect(getAnnouncerElement()?.textContent).toBe("");

    ann.destroy();
    router.stop();
  });

  it("22 — rAF callbacks are no-ops after destroy() (isDestroyed guard)", async () => {
    const router = makeRouter();

    const pendingInnerCallbacks: FrameRequestCallback[] = [];
    let rafNestLevel = 0;

    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      if (rafNestLevel === 0) {
        rafNestLevel++;
        cb(0);
        rafNestLevel--;
      } else {
        pendingInnerCallbacks.push(cb);
      }

      return 0;
    });

    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    const h1 = document.createElement("h1");

    h1.textContent = "About";
    document.body.append(h1);
    const focusSpy = vi.spyOn(h1, "focus");

    document.title = "About";
    await router.navigate("about");

    expect(pendingInnerCallbacks).toHaveLength(1);
    expect(getAnnouncerElement()?.textContent).toBe("");

    ann.destroy();

    for (const cb of pendingInnerCallbacks) {
      cb(0);
    }

    expect(getAnnouncerElement()).toBeNull();
    expect(focusSpy).not.toHaveBeenCalled();

    router.stop();
  });

  it("23 — multiple h1 elements: announcer uses the first one", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    const h1First = document.createElement("h1");

    h1First.textContent = "First Heading";
    document.body.append(h1First);

    const h1Second = document.createElement("h1");

    h1Second.textContent = "Second Heading";
    document.body.append(h1Second);

    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe(
      "Navigated to First Heading",
    );

    ann.destroy();
    router.stop();
  });

  it("24 — re-announces same text after auto-clear timeout resets lastAnnouncedText", async () => {
    const router = makeRouter();
    const ann = setupAnnouncer(router);

    await router.start("/");
    vi.advanceTimersByTime(100);

    document.title = "About";
    await router.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe("Navigated to About");

    vi.advanceTimersByTime(7001);

    expect(getAnnouncerElement()?.textContent).toBe("");

    await router.navigate("about", {}, undefined, { reload: true });

    expect(getAnnouncerElement()?.textContent).toBe("Navigated to About");

    ann.destroy();
    router.stop();
  });

  it("25 — #783: destroy of one provider does not silence the others (shared element ref-counted)", async () => {
    const r1 = makeRouter();
    const r2 = makeRouter();
    const ann1 = setupAnnouncer(r1);
    const ann2 = setupAnnouncer(r2);

    await r1.start("/");
    await r2.start("/");
    vi.advanceTimersByTime(100);

    expect(document.querySelectorAll(ANNOUNCER_ATTR)).toHaveLength(1);

    const shared = getAnnouncerElement();

    // First provider tears down. The shared aria-live element must survive for
    // the still-mounted second provider — before the fix it was removed
    // unconditionally, leaving the survivor writing to a detached node (screen-
    // reader silence).
    ann1.destroy();

    expect(getAnnouncerElement()).not.toBeNull();
    expect(getAnnouncerElement()).toBe(shared);
    expect(shared?.isConnected).toBe(true);

    // The surviving provider still announces into the live element.
    document.title = "About Page";
    await r2.navigate("about");

    expect(getAnnouncerElement()?.textContent).toBe("Navigated to About Page");

    // Last holder gone → element removed.
    ann2.destroy();

    expect(getAnnouncerElement()).toBeNull();

    r1.stop();
    r2.stop();
  });

  it("26 — #783: destroy() is idempotent and does not over-decrement the shared ref-count", async () => {
    const r1 = makeRouter();
    const r2 = makeRouter();
    const ann1 = setupAnnouncer(r1);
    const ann2 = setupAnnouncer(r2);

    await r1.start("/");
    await r2.start("/");

    // Redundant destroy() calls on the first provider must be no-ops, NOT extra
    // decrements — otherwise the count drops below the live holder count and
    // the second provider's element is removed prematurely (or never).
    ann1.destroy();
    ann1.destroy();
    ann1.destroy();

    expect(getAnnouncerElement()).not.toBeNull();

    // The single remaining holder removes the element exactly once.
    ann2.destroy();

    expect(getAnnouncerElement()).toBeNull();

    r1.stop();
    r2.stop();
  });

  it("27 — #1217: a stale instance's destroy() does not remove a re-created (newer-generation) element", async () => {
    const r1 = makeRouter();
    const r2 = makeRouter();
    const ann1 = setupAnnouncer(r1);
    const ann2 = setupAnnouncer(r2);

    await r1.start("/");
    await r2.start("/");

    const original = getAnnouncerElement();

    // Host wipes the shared element WITHOUT calling either instance's destroy()
    // — a subtree clear, an HMR swap, a test teardown that resets the DOM.
    original?.remove();

    expect(getAnnouncerElement()).toBeNull();

    // A fresh provider re-creates the element — a NEW generation.
    const r3 = makeRouter();
    const ann3 = setupAnnouncer(r3);

    await r3.start("/");

    const recreated = getAnnouncerElement();

    expect(recreated).not.toBeNull();
    expect(recreated).not.toBe(original);

    // The stale ann1/ann2 (old generation) tear down. Before #1217 their
    // destroy() removed the element by selector — deleting `recreated` (the LIVE
    // generation's element) and driving the ref-count negative. The generation
    // guard makes them no-ops.
    ann1.destroy();
    ann2.destroy();

    expect(getAnnouncerElement()).toBe(recreated);
    expect(recreated?.isConnected).toBe(true);

    // The live holder still owns teardown: its destroy removes exactly its element.
    ann3.destroy();

    expect(getAnnouncerElement()).toBeNull();

    r1.stop();
    r2.stop();
    r3.stop();
  });

  it("SSR guard — returns a NOOP instance when `document` is undefined", () => {
    const realDocument = globalThis.document;

    vi.stubGlobal("document", undefined);

    try {
      const ann = createRouteAnnouncer(makeRouter());

      // Frozen NOOP: destroy is callable and inert, no element created.
      expect(typeof ann.destroy).toBe("function");
      expect(() => {
        ann.destroy();
      }).not.toThrow();
    } finally {
      vi.stubGlobal("document", realDocument);
    }
  });

  it("falls back to documentElement when document.body is null", async () => {
    Object.defineProperty(document, "body", {
      configurable: true,
      value: null,
    });

    try {
      const router = makeRouter();
      const ann = setupAnnouncer(router);

      await router.start("/");

      const element = document.documentElement.querySelector(ANNOUNCER_ATTR);

      expect(element).not.toBeNull();
      expect(element?.parentElement).toBe(document.documentElement);

      ann.destroy();
      router.stop();
    } finally {
      // Drop the instance override so the Document.prototype `body` getter
      // is restored for afterEach (which reads document.body).
      delete (document as { body?: HTMLElement }).body;
    }
  });

  it("logs and falls back to the default chain when getAnnouncementText throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = makeRouter();
    const ann = setupAnnouncer(router, {
      getAnnouncementText: () => {
        throw new Error("boom");
      },
    });

    await router.start("/");
    vi.advanceTimersByTime(100);

    document.title = "Fallback Title";
    await router.navigate("about");

    expect(errorSpy).toHaveBeenCalledWith(
      "[real-router] getAnnouncementText threw; falling back to default resolution.",
      expect.any(Error),
    );
    // The throw is swallowed; resolution continues down the default chain
    // (h1 → document.title → route.name), so the announcer still updates.
    expect(getAnnouncerElement()?.textContent).toBe(
      "Navigated to Fallback Title",
    );

    errorSpy.mockRestore();
    ann.destroy();
    router.stop();
  });
});
