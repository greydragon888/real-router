import { test } from "@fast-check/vitest";
import { describe, expect, beforeAll, afterAll, vi } from "vitest";

import {
  NUM_RUNS,
  arbRouteName,
  arbNonEmptyPrefix,
  arbInstanceCount,
  createMockRouter,
} from "./helpers";
import { createRouteAnnouncer } from "../../src";

const ANNOUNCER_ATTR = "[data-real-router-announcer]";

describe("RouteAnnouncer — Property Tests", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("Invariant 1: getOrCreateAnnouncer is idempotent", () => {
    test.prop([arbInstanceCount], { numRuns: NUM_RUNS.standard })(
      "creating N announcers never produces more than 1 [data-real-router-announcer] element",
      (n) => {
        document.body.innerHTML = "";

        const instances = Array.from({ length: n }, () => {
          const { router } = createMockRouter();

          return createRouteAnnouncer(router);
        });

        const count = document.querySelectorAll(ANNOUNCER_ATTR).length;

        expect(count).toBeLessThanOrEqual(1);

        for (const ann of instances) {
          ann.destroy();
        }

        document.body.innerHTML = "";
      },
    );
  });

  describe("Invariant 2: resolveText always returns non-empty when prefix is non-empty", () => {
    test.prop([arbNonEmptyPrefix, arbRouteName], {
      numRuns: NUM_RUNS.standard,
    })(
      "announcer textContent is non-empty after navigation when prefix is non-empty",
      (prefix, routeName) => {
        document.body.innerHTML = "";
        document.title = "";

        const { router, trigger } = createMockRouter();
        const ann = createRouteAnnouncer(router, { prefix });

        trigger("skip");
        vi.advanceTimersByTime(100);
        trigger(routeName);

        const text =
          document.querySelector<HTMLElement>(ANNOUNCER_ATTR)?.textContent ??
          "";

        expect(text.length).toBeGreaterThan(0);

        ann.destroy();
        document.body.innerHTML = "";
        document.title = "";
      },
    );
  });

  describe("Invariant 3: create/destroy symmetry", () => {
    test.prop([arbInstanceCount], { numRuns: NUM_RUNS.standard })(
      "after all destroy() calls, no announcer element remains in the DOM",
      (n) => {
        document.body.innerHTML = "";

        const instances = Array.from({ length: n }, () => {
          const { router } = createMockRouter();

          return createRouteAnnouncer(router);
        });

        for (const ann of instances) {
          ann.destroy();
        }

        const count = document.querySelectorAll(ANNOUNCER_ATTR).length;

        expect(count).toBe(0);

        document.body.innerHTML = "";
      },
    );
  });
});
