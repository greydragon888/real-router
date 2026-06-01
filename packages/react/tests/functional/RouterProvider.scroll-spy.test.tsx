import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider } from "@real-router/react";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

const ioInstances: { disconnect: ReturnType<typeof vi.fn> }[] = [];

function installFakeIntersectionObserver(): void {
  ioInstances.length = 0;

  const FakeIO = class implements IntersectionObserver {
    public readonly root: Element | Document | null = null;
    public readonly rootMargin: string = "";
    public readonly scrollMargin: string = "";
    public readonly thresholds: readonly number[] = [];
    public disconnect = vi.fn();

    constructor(_cb: IntersectionObserverCallback) {
      ioInstances.push({ disconnect: this.disconnect });
    }

    public observe(): void {
      /* no-op */
    }

    public unobserve(): void {
      /* no-op */
    }

    public takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  };

  vi.stubGlobal("IntersectionObserver", FakeIO);
  vi.stubGlobal(
    "MutationObserver",
    class implements MutationObserver {
      public observe(): void {
        /* no-op */
      }

      public disconnect(): void {
        /* no-op */
      }

      public takeRecords(): MutationRecord[] {
        return [];
      }
    },
  );
}

describe("RouterProvider — scrollSpy", () => {
  let router: Router;

  beforeEach(async () => {
    installFakeIntersectionObserver();
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
    vi.unstubAllGlobals();
  });

  it("no scrollSpy prop — IntersectionObserver not instantiated", () => {
    render(
      <RouterProvider router={router}>
        <div />
      </RouterProvider>,
    );

    expect(ioInstances).toHaveLength(0);
  });

  it("scrollSpy with empty selector — no observer", () => {
    render(
      <RouterProvider router={router} scrollSpy={{ selector: "" }}>
        <div />
      </RouterProvider>,
    );

    expect(ioInstances).toHaveLength(0);
  });

  it("scrollSpy with selector — creates IntersectionObserver, disposes on unmount", () => {
    const { unmount } = render(
      <RouterProvider router={router} scrollSpy={{ selector: "[id]" }}>
        <div />
      </RouterProvider>,
    );

    expect(ioInstances.length).toBeGreaterThanOrEqual(1);

    unmount();

    for (const inst of ioInstances) {
      expect(inst.disconnect).toHaveBeenCalled();
    }
  });
});
