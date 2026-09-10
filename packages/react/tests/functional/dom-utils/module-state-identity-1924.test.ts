import { createRouter } from "@real-router/core";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  createDirectionTracker,
  createRouteAnnouncer,
  createScrollRestoration,
} from "../../../src/dom-utils";

import type { Router, State } from "@real-router/core";

/**
 * Three pieces of module state, one idea: state that outlives what it describes
 * is read as if it still described it (#1924).
 *
 * ⚑ The directory already carries the idea twice — `view-transitions.ts` has
 * `scheduledVT` (#781) and `scroll-restore.ts` has `scrollSettled` on the
 * CAPTURE side (#782). These three are the places it was missing.
 */

type Listener = (payload: {
  route: State;
  previousRoute?: State | undefined;
}) => void;

const STORAGE_KEY = "real-router:scroll";
const BACK = { navigation: { direction: "back" } };

function makeState(name: string, context: Record<string, unknown> = {}): State {
  return {
    name,
    params: {},
    search: {},
    path: `/${name}`,
    context,
    transition: {} as State["transition"],
  };
}

function makeFakeRouter(initial: State): {
  router: Router;
  emit: (to: State, from?: State) => void;
  leave: () => void;
} {
  const listeners = new Set<Listener>();
  const leavers = new Set<() => void>();
  let current = initial;
  const router = {
    subscribe(fn: Listener) {
      listeners.add(fn);

      return () => listeners.delete(fn);
    },
    subscribeLeave(fn: () => void) {
      leavers.add(fn);

      return () => leavers.delete(fn);
    },
    getState: () => current,
  } as unknown as Router;

  return {
    router,
    emit: (to, from) => {
      current = to;

      for (const fn of listeners) {
        fn({ route: to, previousRoute: from });
      }
    },
    leave: () => {
      for (const fn of leavers) {
        fn();
      }
    },
  };
}

describe("#1924 — module state carries identity", () => {
  let queue: FrameRequestCallback[];

  beforeEach(() => {
    queue = [];
    sessionStorage.clear();
    document.body.innerHTML = "";
    delete document.documentElement.dataset.navDirection;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      queue.push(cb);

      return queue.length;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const flush = (): void => {
    for (const cb of queue.splice(0)) {
      cb(0);
    }
  };

  it("1 · a stale retry loop cannot write the previous route's offset", () => {
    // The loop's budget exists for a container that has not laid out yet, so
    // the discriminating arc is an UNREACHABLE target: the scroll clamps short,
    // the target-reached early exit cannot fire, and the loop rides all ten
    // frames. The narrower arc — container mounts late, no clamp — self-heals
    // the moment it appears, which is why it is not the one measured here.
    let limit = 120;
    let scrollTop = 0;
    const element = document.createElement("div");

    Object.defineProperty(element, "scrollTop", {
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = Math.min(v, limit);
      },
      configurable: true,
    });
    element.scrollTo = ((o: ScrollToOptions) => {
      element.scrollTop = o.top ?? 0;
    }) as typeof element.scrollTo;

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ "/a": 900, "/b": 100 }),
    );

    const fake = makeFakeRouter(makeState("home"));
    const sr = createScrollRestoration(fake.router, {
      mode: "restore",
      scrollContainer: () => element,
      behavior: "auto",
    });

    try {
      fake.emit(makeState("a", BACK), makeState("home"));
      flush();

      expect(element.scrollTop, "clamped, so the loop keeps retrying").toBe(
        120,
      );

      fake.emit(makeState("b", BACK), makeState("a"));
      flush();

      expect(element.scrollTop, "the current route settles").toBe(100);

      // The first container's layout grows: the stale loop could now reach 900.
      limit = 2000;
      flush();

      expect(element.scrollTop, "and the stale loop is retired").toBe(100);
    } finally {
      sr.destroy();
    }
  });

  it("2 · a second bundle's destroy cannot remove the first's announcer", () => {
    // Two adapter bundles on one page. Module-scoped counters make the second
    // one read its OWN generation (never bumped on the `existing` branch), pass
    // the #1217 ownership guard and remove the live element — with the counters
    // on the node, both read the same values.
    const fakeA = makeFakeRouter(makeState("home"));
    const fakeB = makeFakeRouter(makeState("home"));

    const a = createRouteAnnouncer(fakeA.router);
    const b = createRouteAnnouncer(fakeB.router);

    b.destroy();

    expect(
      document.querySelector("[data-real-router-announcer]"),
      "A is still live, so the element stays",
    ).not.toBeNull();

    a.destroy();

    expect(
      document.querySelector("[data-real-router-announcer]"),
      "the last holder tears it down",
    ).toBeNull();
  });

  it("3 · a popstate that produces no transition does not mislabel the next navigation", async () => {
    // What a URL plugin does with `history.back()` onto an entry resolving to
    // the current state: it hands core that state, and core refuses. Measured,
    // that arc emits TRANSITION_ERROR with no TRANSITION_START and no leave —
    // so the flag is spent by the refusal rather than by a clock.
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    await router.start("/");

    const tracker = createDirectionTracker(router);

    try {
      expect(document.documentElement.dataset.navDirection).toBe("forward");

      globalThis.dispatchEvent(new PopStateEvent("popstate"));

      await expect(router.navigate("home")).rejects.toMatchObject({
        code: "SAME_STATES",
      });

      // A forward navigation afterwards.
      await router.navigate("about");

      expect(
        document.documentElement.dataset.navDirection,
        "the spent flag does not claim this was a back navigation",
      ).toBe("forward");
    } finally {
      tracker.destroy();
    }
  });

  it("3 · a popstate arriving MID-transition belongs to the replay, not to it", async () => {
    // The plugin DEFERS a popstate that lands during an in-flight transition
    // and replays it from that transition's `finally`. So the running
    // transition's terminal event must not spend a flag it never owned.
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      { name: "contacts", path: "/contacts" },
    ]);

    await router.start("/");

    const tracker = createDirectionTracker(router);
    let armed = false;
    const offLeave = router.subscribeLeave(() => {
      if (!armed) {
        armed = true;
        globalThis.dispatchEvent(new PopStateEvent("popstate"));
      }
    });

    try {
      await router.navigate("about");

      expect(
        document.documentElement.dataset.navDirection,
        "the running transition read the flag before it was armed",
      ).toBe("forward");

      await router.navigate("contacts");

      expect(
        document.documentElement.dataset.navDirection,
        "and the deferred event still owns its flag",
      ).toBe("back");
    } finally {
      offLeave();
      tracker.destroy();
    }
  });

  it("3 · control — a popstate the router DOES consume still reads as back", async () => {
    // The same event, with a navigation core accepts. A clock cannot tell these
    // two apart: the leave phase sits behind every deactivation guard, and a
    // guard may be async.
    const router = createRouter([
      {
        name: "home",
        path: "/",
        canDeactivate: () => async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));

          return true;
        },
      },
      { name: "about", path: "/about" },
    ]);

    await router.start("/");

    const tracker = createDirectionTracker(router);

    try {
      globalThis.dispatchEvent(new PopStateEvent("popstate"));
      await router.navigate("about");

      expect(document.documentElement.dataset.navDirection).toBe("back");
    } finally {
      tracker.destroy();
    }
  });
});
