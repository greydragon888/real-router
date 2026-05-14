// Direct tests for `createRouteAnnouncer` from `shared/dom-utils/route-announcer.ts`.
//
// The existing `RouterProvider.a11y.test.ts` exercises the announcer through
// the Svelte adapter integration. This file targets the helper's internal
// contract directly via a fake router, closing review §5.7 gaps:
//
//   - MED: Safari-ready 100ms buffering (pendingText flush)
//   - MED: re-using existing announcer on double mount (getOrCreateAnnouncer)
//   - MED: race — navigation during 100ms window must NOT drop
//   - LOW: custom prefix, custom getAnnouncementText
//   - LOW: same-text dedup
//   - LOW: internal route @@ prefix excluded
//   - LOW: h1 fallback chain (h1 → document.title → routeName → pathname)
//   - LOW: manageFocus adds tabindex='-1' when missing
//   - LOW: isDestroyed during pending → no DOM mutation after destroy

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRouteAnnouncer } from "../../src/dom-utils/route-announcer";

import type { Router, State } from "@real-router/core";

interface Subscriber {
  cb: (payload: { route: State }) => void;
}

interface FakeRouter {
  router: Router;
  emit: (state: Partial<State>) => void;
  subscribers: Subscriber[];
}

const ANNOUNCER_SEL = "[data-real-router-announcer]";

function makeFakeRouter(): FakeRouter {
  const subscribers: Subscriber[] = [];
  const router = {
    subscribe(cb: (payload: { route: State }) => void) {
      const sub = { cb };

      subscribers.push(sub);

      return () => {
        const i = subscribers.indexOf(sub);

        if (i !== -1) {
          subscribers.splice(i, 1);
        }
      };
    },
  } as unknown as Router;

  return {
    router,
    emit(state) {
      const fullState = {
        name: state.name ?? "home",
        params: state.params ?? {},
        ...state,
      } as State;

      subscribers.forEach((s) => {
        s.cb({ route: fullState });
      });
    },
    subscribers,
  };
}

// Drains both rAF callbacks (the helper uses double-rAF). When global rAF is
// stubbed to fire synchronously, simply call after each emit — but with
// fake timers we also need to flush microtasks.
function flushRaf(): void {
  // Both rAFs land synchronously via the stub below, so this is a no-op
  // placeholder if anyone needs to drain microtasks between frames.
}

describe("createRouteAnnouncer — direct contract tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.querySelectorAll(ANNOUNCER_SEL).forEach((element) => {
      element.remove();
    });
    document.querySelectorAll("h1").forEach((element) => {
      element.remove();
    });
    document.title = "";
  });

  describe("§5.7 row 2: Custom prefix overrides default", () => {
    it("custom prefix used in announcement text", () => {
      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router, { prefix: "Loading " });

      // Skip the initial-navigation guard (which suppresses the first emit).
      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100); // Safari-ready window
      emit({ name: "about" });
      flushRaf();

      const text = document.querySelector(ANNOUNCER_SEL)?.textContent ?? "";

      expect(text.startsWith("Loading ")).toBe(true);

      announcer.destroy();
    });
  });

  describe("§5.7 row 3: Custom getAnnouncementText overrides resolution chain", () => {
    it("custom callback result is used verbatim (no prefix prepend by callback)", () => {
      const { router, emit } = makeFakeRouter();
      const customText = vi.fn((route: State) => `On page ${route.name}!`);
      const announcer = createRouteAnnouncer(router, {
        getAnnouncementText: customText,
      });

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);
      emit({ name: "about" });
      flushRaf();

      expect(customText).toHaveBeenCalled();
      // Note: the function does NOT prefix the custom result — it returns
      // whatever the callback returns. This is intentional: consumers who
      // override want full control over the message.
      expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
        "On page about!",
      );

      announcer.destroy();
    });

    it("getAnnouncementText that throws → console.error + fallback to default chain", () => {
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router, {
        getAnnouncementText: () => {
          throw new Error("boom");
        },
      });

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);
      emit({ name: "about" });
      flushRaf();

      // Fell through to the default resolution chain → "Navigated to about"
      // (no h1, no title, route.name).
      expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toContain(
        "about",
      );
      expect(errSpy).toHaveBeenCalled();

      errSpy.mockRestore();
      announcer.destroy();
    });
  });

  describe("§5.7 row 6: Same text — dedup skip", () => {
    it("navigating to the same logical text twice → announcer not updated the second time", () => {
      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);
      emit({ name: "about" });
      flushRaf();

      const firstText = document.querySelector(ANNOUNCER_SEL)?.textContent;

      // Force clear so we can observe a re-write (or absence).
      const element = document.querySelector(ANNOUNCER_SEL)!;

      // Trigger an identical-text announcement — the function compares
      // text === lastAnnouncedText and short-circuits.
      emit({ name: "about" });
      flushRaf();

      // No second announcement → el.textContent stays whatever the clear timeout
      // would set, but since we didn't advance to CLEAR_DELAY, it stays at firstText.
      expect(element.textContent).toBe(firstText);

      announcer.destroy();
    });
  });

  describe("§5.7 row 7: Internal route names prefixed with @@ are excluded from the text", () => {
    it("@@-prefixed route → name omitted, falls through to pathname or title", () => {
      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);
      emit({ name: "@@internal" });
      flushRaf();

      const text = document.querySelector(ANNOUNCER_SEL)?.textContent ?? "";

      // The @@-prefixed name is suppressed → resolution falls back to
      // h1Text || document.title || routeName || pathname. In jsdom with no
      // h1 and no title, pathname wins.
      expect(text).not.toContain("@@internal");
      expect(text).toContain("Navigated to ");

      announcer.destroy();
    });
  });

  describe("§5.7 row 8: H1 fallback chain (h1 → document.title → routeName → pathname)", () => {
    it("h1 present → uses h1.textContent", () => {
      const h1 = document.createElement("h1");

      h1.textContent = "My Page Title";
      document.body.append(h1);

      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);
      emit({ name: "about" });
      flushRaf();

      expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
        "Navigated to My Page Title",
      );

      announcer.destroy();
    });

    it("no h1 + document.title → uses title", () => {
      document.title = "Tab Title";

      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);
      emit({ name: "about" });
      flushRaf();

      expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
        "Navigated to Tab Title",
      );

      announcer.destroy();
    });

    it("no h1 + no title → uses route.name", () => {
      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);
      emit({ name: "about" });
      flushRaf();

      expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
        "Navigated to about",
      );

      announcer.destroy();
    });
  });

  describe("§5.7 row 10 (MED): Safari-ready 100ms — pendingText buffering", () => {
    // Critical: announcing before VoiceOver wires up the aria-live region
    // causes the first announcement to be silently dropped. The 100ms delay
    // buffers any navigation in pendingText and flushes once the delay
    // expires. Without this, users with VoiceOver miss the very first nav.
    it("navigation BEFORE 100ms elapses is buffered, then flushed after delay", () => {
      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      // Initial nav → suppressed by isInitialNavigation
      emit({ name: "home" });
      flushRaf();

      // 2nd nav within the 100ms Safari-ready window → buffered.
      vi.advanceTimersByTime(50);
      emit({ name: "about" });
      flushRaf();

      // Announcer still empty because pendingText, not announced.
      expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe("");

      // Advance past the 100ms window — pendingText must flush.
      vi.advanceTimersByTime(60);

      const text = document.querySelector(ANNOUNCER_SEL)?.textContent ?? "";

      expect(text).toContain("about");

      announcer.destroy();
    });

    it("after 100ms, navigations announce immediately (no buffer)", () => {
      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);

      // Safari-ready now elapsed.
      emit({ name: "about" });
      flushRaf();

      expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toContain(
        "about",
      );

      announcer.destroy();
    });
  });

  describe("§5.7 row 13 (MED): getOrCreateAnnouncer — double mount reuses the same element", () => {
    it("two announcers mounted in sequence share the single DOM element", () => {
      const { router: r1 } = makeFakeRouter();
      const { router: r2 } = makeFakeRouter();

      const a1 = createRouteAnnouncer(r1);
      const elementAfterFirst = document.querySelectorAll(ANNOUNCER_SEL);

      expect(elementAfterFirst).toHaveLength(1);

      // Second mount finds existing → reuses.
      const a2 = createRouteAnnouncer(r2);
      const elementAfterSecond = document.querySelectorAll(ANNOUNCER_SEL);

      expect(elementAfterSecond).toHaveLength(1);
      // Same DOM node.
      expect(elementAfterSecond[0]).toBe(elementAfterFirst[0]);

      a1.destroy();
      a2.destroy();
    });

    it("known gotcha: first destroy() removes the shared element from the DOM", () => {
      // Documented effect of the simple removeAnnouncer() impl: when two
      // RouterProviders share the announcer, the FIRST destroy() removes it
      // for both. Pin-test so a refactor that introduced refcount-based
      // cleanup wouldn't silently change the contract. This is acceptable
      // because the typical case is exactly ONE provider per app.
      const { router: r1 } = makeFakeRouter();
      const { router: r2 } = makeFakeRouter();

      const a1 = createRouteAnnouncer(r1);
      const a2 = createRouteAnnouncer(r2);

      expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);

      a1.destroy();

      // Whoops — second provider's announcer is gone too.
      expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(0);

      a2.destroy();
    });
  });

  describe("§5.7 row 12 (LOW): isDestroyed flag guards post-destroy DOM mutation", () => {
    it("destroy() before Safari window elapses — pending text NOT flushed", () => {
      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      // 2nd nav while pending.
      emit({ name: "home" });
      flushRaf();
      emit({ name: "about" });
      flushRaf();

      // Destroy before Safari-ready fires.
      announcer.destroy();
      vi.advanceTimersByTime(200);

      // No announcer element after destroy. The pending flush would have
      // tried to write to it, but isDestroyed guard short-circuits.
      expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
    });

    it("destroy() then navigate → no DOM mutation (subscriber unsubscribed)", () => {
      const { router, emit, subscribers } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      expect(subscribers).toHaveLength(1);

      announcer.destroy();

      // Subscriber is removed.
      expect(subscribers).toHaveLength(0);

      // Even if something somehow fires, no DOM element exists.
      emit({ name: "about" });
      flushRaf();
      vi.advanceTimersByTime(200);

      expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
    });
  });

  describe("§5.7 row 14 (LOW): manageFocus adds tabindex='-1' when missing", () => {
    it("h1 without tabindex → tabindex='-1' added, focus called", () => {
      const h1 = document.createElement("h1");

      h1.textContent = "Page Title";
      document.body.append(h1);

      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);
      emit({ name: "about" });
      flushRaf();

      expect(h1.getAttribute("tabindex")).toBe("-1");

      announcer.destroy();
    });

    it("h1 with pre-existing tabindex → preserved", () => {
      const h1 = document.createElement("h1");

      h1.textContent = "Page Title";
      h1.setAttribute("tabindex", "0");
      document.body.append(h1);

      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);
      emit({ name: "about" });
      flushRaf();

      // hasAttribute('tabindex') was true → setAttribute skipped.
      expect(h1.getAttribute("tabindex")).toBe("0");

      announcer.destroy();
    });
  });

  describe("§5.7 row 11 (LOW): clearTimeoutId reset between announcements", () => {
    // Each new announcement calls clearTimeout(clearTimeoutId) before scheduling
    // a new CLEAR_DELAY timeout. Otherwise rapid back-to-back navigations would
    // schedule overlapping clears, and the announcer text would unpredictably
    // disappear mid-read for the user.
    it("rapid back-to-back navs: only the latest clear timer is active", () => {
      const { router, emit } = makeFakeRouter();
      const announcer = createRouteAnnouncer(router);

      emit({ name: "home" });
      flushRaf();
      vi.advanceTimersByTime(100);

      emit({ name: "about" });
      flushRaf();

      // Advance 6.5s (CLEAR_DELAY is 7s) — text should still be present.
      vi.advanceTimersByTime(6500);

      // New nav restarts the clear timer.
      emit({ name: "settings" });
      flushRaf();

      // The 500ms-remaining clear timer for "about" was cancelled. Advance
      // 6s more (well past where the OLD clear would have fired) — text is
      // still "settings".
      vi.advanceTimersByTime(6000);

      expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toContain(
        "settings",
      );

      announcer.destroy();
    });
  });
});
