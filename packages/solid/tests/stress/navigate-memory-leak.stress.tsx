import { render } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterProvider, Link } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

// Scenario S3 from audit section 7.2: high-volume mount/unmount cycles of
// Link (slow path) probe the new activeSourceCache WeakMap (Phase 1 H1b).
// A missing onLastUnsubscribe leak would surface as unbounded heap growth.
describe("M1 — Link mount/unmount memory leak probe", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(10);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("M1 — 10000 mount/unmount Link cycles — bounded heap", () => {
    const customParams = { id: "probe" };

    const heapBefore = takeHeapSnapshot();

    for (let i = 0; i < 10_000; i++) {
      const { unmount } = render(() => (
        <RouterProvider router={router}>
          <Link routeName="users.view" routeParams={customParams} activeStrict>
            Probe
          </Link>
        </RouterProvider>
      ));

      unmount();
    }

    const heapAfter = takeHeapSnapshot();

    // Heap budget aligned with React/Preact equivalents (§7.4 audit note —
    // 100MB was overly generous and would have masked a slow leak; the
    // tightened 50MB matches the sibling adapters and still leaves headroom
    // over the steady-state ~5-15MB delta observed in CI for 10000 cycles).
    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  }, 120_000);
});
