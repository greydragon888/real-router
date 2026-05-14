import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MB, createStressRouter, takeHeapSnapshot } from "./helpers";
import { RealLink } from "../../src/directives/RealLink";
import { RealLinkActive } from "../../src/directives/RealLinkActive";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

/**
 * Closes review §7.1 #17 (HIGH gap) + #13 (MED gap) — RealLink /
 * RealLinkActive directive stress.
 *
 * The JIT-mode caveat (CLAUDE.md "Coverage Ceiling") restricts signal-input
 * bindings: with `<a [realLink]="value">` templates Angular throws NG0303
 * because the JIT compiler does not recognize signal-based `input()` as a
 * bindable property. We work around this by using **static templates** —
 * directives operate on their default inputs (`routeName=""` etc.), which
 * exercises:
 *
 *   - `applyLinkA11y` mass-mount overhead
 *   - subscription lifecycle (`createActiveRouteSource` subscribe + destroy)
 *   - click handler swallowed-rejection path
 *   - DestroyRef teardown ordering when many instances unmount in one cycle
 *
 * What's NOT covered (AOT-only, documented limitation): routeName changing
 * mid-flight, hash-aware active state with a bound signal input.
 */
describe("RealLink / RealLinkActive directive fanout stress", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(20);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("(a) 100 <a realLink> elements + 100 navigations — bounded heap, all subscribed/cleaned", async () => {
    @Component({
      imports: [RealLink],
      template: `
        @for (i of items; track i) {
          <a realLink>Link {{ i }}</a>
        }
      `,
    })
    class LinkGrid {
      items = Array.from({ length: 100 }, (_, i) => i);
    }

    TestBed.configureTestingModule({
      imports: [LinkGrid],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(LinkGrid);

    fixture.detectChanges();

    const anchors: NodeListOf<HTMLAnchorElement> =
      fixture.nativeElement.querySelectorAll("a");

    expect(anchors).toHaveLength(100);

    const heapBefore = takeHeapSnapshot();
    const routeNames = Array.from({ length: 20 }, (_, i) => `route${i}`);

    for (let i = 0; i < 100; i++) {
      const target = routeNames[i % routeNames.length];

      if (router.getState()?.name !== target) {
        await router.navigate(target);
      }
    }

    const heapAfter = takeHeapSnapshot();

    // 100 active sources × 100 navs would leak ~MBs if subscribe path
    // allocated per-emit. The cached `createActiveRouteSource` keeps this
    // bounded.
    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);

    fixture.destroy();
  }, 60_000);

  it("(b) 50 mount/unmount cycles with 50 anchors each — applyLinkA11y skip on <a> + clean teardown", () => {
    @Component({
      imports: [RealLink],
      template: `
        @for (i of items; track i) {
          <a realLink>Link {{ i }}</a>
        }
      `,
    })
    class LinkGrid {
      items = Array.from({ length: 50 }, (_, i) => i);
    }

    const heapBefore = takeHeapSnapshot();

    for (let cycle = 0; cycle < 50; cycle++) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [LinkGrid],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(LinkGrid);

      fixture.detectChanges();

      const anchors: NodeListOf<HTMLAnchorElement> =
        fixture.nativeElement.querySelectorAll("a");

      expect(anchors).toHaveLength(50);

      // applyLinkA11y is invoked by RealLinkActive, NOT RealLink. RealLink
      // operates on a native <a> so role/tabindex must remain absent here —
      // this pins the directive's no-op behaviour against accidental cross-
      // contamination with RealLinkActive's a11y stamping.
      for (const a of anchors) {
        expect(a.hasAttribute("role")).toBe(false);
        expect(a.hasAttribute("tabindex")).toBe(false);
      }

      fixture.destroy();
    }

    TestBed.resetTestingModule();
    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);
  }, 60_000);

  it("(c) RealLinkActive on 100 <div> elements — applyLinkA11y stamps role/tabindex, idempotent across CD", () => {
    @Component({
      imports: [RealLinkActive],
      template: `
        @for (i of items; track i) {
          <div realLinkActive>Item {{ i }}</div>
        }
      `,
    })
    class ActiveGrid {
      items = Array.from({ length: 100 }, (_, i) => i);
    }

    TestBed.configureTestingModule({
      imports: [ActiveGrid],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(ActiveGrid);

    fixture.detectChanges();

    const divs: NodeListOf<HTMLDivElement> =
      fixture.nativeElement.querySelectorAll("div");

    expect(divs).toHaveLength(100);

    // applyLinkA11y stamps role + tabindex on injectable tags. 100 divs
    // → 100 stamped elements.
    for (const div of divs) {
      expect(div.getAttribute("role")).toBe("link");
      expect(div.getAttribute("tabindex")).toBe("0");
    }

    // Trigger 10 change detection cycles — directive's lifecycle hooks
    // must not re-stamp or overwrite (applyLinkA11y uses hasAttribute
    // guard).
    for (let i = 0; i < 10; i++) {
      fixture.detectChanges();
    }

    for (const div of divs) {
      expect(div.getAttribute("role")).toBe("link");
      expect(div.getAttribute("tabindex")).toBe("0");
    }

    fixture.destroy();
  });

  it("(d) Concurrent click handlers — 50 rapid clicks via dispatchEvent, no unhandled rejection", async () => {
    @Component({
      imports: [RealLink],
      template: `
        @for (i of items; track i) {
          <a realLink>Link {{ i }}</a>
        }
      `,
    })
    class LinkGrid {
      items = Array.from({ length: 50 }, (_, i) => i);
    }

    TestBed.configureTestingModule({
      imports: [LinkGrid],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(LinkGrid);

    fixture.detectChanges();

    const anchors: NodeListOf<HTMLAnchorElement> =
      fixture.nativeElement.querySelectorAll("a");

    // Track unhandled rejections during the storm.
    const unhandled: PromiseRejectionEvent[] = [];
    const handler = (event: PromiseRejectionEvent): void => {
      unhandled.push(event);
    };

    globalThis.addEventListener("unhandledrejection", handler);

    // Dispatch 50 click events synchronously. Each anchor calls
    // router.navigate("") which rejects (empty routeName → buildPath
    // throws). RealLink.onClick swallows via `.catch(() => {})`.
    for (const a of anchors) {
      const event = new MouseEvent("click", {
        button: 0,
        bubbles: true,
        cancelable: true,
      });

      a.dispatchEvent(event);
    }

    // Let any pending promises settle.
    await new Promise((resolve) => setTimeout(resolve, 50));

    globalThis.removeEventListener("unhandledrejection", handler);

    expect(unhandled).toHaveLength(0);

    fixture.destroy();
  });

  it("(e) 100 RealLinkActive divs × 50 navigations — class toggle stays consistent, no leak", async () => {
    @Component({
      imports: [RealLinkActive],
      template: `
        @for (i of items; track i) {
          <div realLinkActive>Item {{ i }}</div>
        }
      `,
    })
    class ActiveGrid {
      items = Array.from({ length: 100 }, (_, i) => i);
    }

    TestBed.configureTestingModule({
      imports: [ActiveGrid],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(ActiveGrid);

    fixture.detectChanges();

    const divs: NodeListOf<HTMLDivElement> =
      fixture.nativeElement.querySelectorAll("div");

    const heapBefore = takeHeapSnapshot();
    const routeNames = Array.from({ length: 20 }, (_, i) => `route${i}`);

    for (let i = 0; i < 50; i++) {
      const target = routeNames[i % routeNames.length];

      if (router.getState()?.name !== target) {
        await router.navigate(target);
      }
    }

    // realLinkActive is "" by default → updateClass early-returns → no
    // classes stamped. Locks the contract that a non-existent active
    // class name produces zero class side-effects.
    for (const div of divs) {
      expect(div.className).toBe("");
    }

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(50 * MB);

    fixture.destroy();
  }, 60_000);
});
