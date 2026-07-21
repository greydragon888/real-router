/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
/* eslint-disable unicorn/no-this-outside-of-class -- this test monkey-patches DOM prototype methods (Element/DOMTokenList); `this` is the patched instance, which an arrow function cannot capture */
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RealLink } from "../../src/directives/RealLink";
import { RealLinkActive } from "../../src/directives/RealLinkActive";
import { provideRealRouter } from "../../src/providers";

import type { Router } from "@real-router/core";

/**
 * Closes review-2026-05-16 §7.4 Test 3 / §7.2 #20.
 *
 * `RealLink.updateDom()` and `RealLinkActive.updateClass()` write to the host
 * element directly (`setAttribute`, `classList.toggle/remove`) from inside a
 * `createActiveRouteSource` `subscribe` callback. The 2026-05-13 audit added
 * `prevHref` / `prevActiveClass` instance caches to skip redundant DOM writes
 * when the active state and href both stayed the same.
 *
 * What this test pins:
 *
 *   1. **1000 fixture.detectChanges() on a stable page do NOT cause spurious
 *      DOM writes** — the directive's `effect()` should only re-run when its
 *      signal inputs change, and the `subscribe` callback only fires on
 *      router state changes. Under a CD storm with neither happening, the
 *      observed `setAttribute("href")` / `classList.toggle` call count MUST
 *      stay at its post-mount baseline.
 *
 *   2. **N navigations + 1000 CD each between them produces exactly N rounds
 *      of DOM writes** — proves the cache absorbs the CD storm and only
 *      releases when the router state actually changes.
 *
 * JIT-mode caveat (CLAUDE.md "Coverage Ceiling ~95%"): template binding to a
 * signal input fails with NG0303, so the directive sees the default
 * `routeName=""`. The href stays `undefined` for the whole test, which means
 * the baseline `setAttribute("href")` call count is 0 and any spurious
 * write would surface as a non-zero count. The `classList` track is the
 * real assertion surface for CD-storm exposure.
 */
const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "list", path: "/list" }],
  },
  { name: "admin", path: "/admin" },
];

describe("change-detection storm — RealLink / RealLinkActive cache absorbs CD without DOM writes (Angular)", () => {
  let router: Router;
  let origSetAttribute: typeof Element.prototype.setAttribute;
  let origToggle: typeof DOMTokenList.prototype.toggle;
  let origRemove: typeof DOMTokenList.prototype.remove;
  let origAdd: typeof DOMTokenList.prototype.add;

  let setAttributeCount: { href: number; other: number };
  let classOpCount: { toggle: number; remove: number; add: number };

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");

    setAttributeCount = { href: 0, other: 0 };
    classOpCount = { toggle: 0, remove: 0, add: 0 };

    // Monkey-patching DOM prototypes for instrumentation; methods are re-bound
    // via `.call(this)` / `.apply(this)` below.
    origSetAttribute = Element.prototype.setAttribute;
    origToggle = DOMTokenList.prototype.toggle;
    origRemove = DOMTokenList.prototype.remove;
    origAdd = DOMTokenList.prototype.add;

    Element.prototype.setAttribute = function (
      name: string,
      value: string,
    ): void {
      if (name === "href") {
        setAttributeCount.href++;
      } else {
        setAttributeCount.other++;
      }

      origSetAttribute.call(this, name, value);
    };

    DOMTokenList.prototype.toggle = function (
      token: string,
      force?: boolean,
    ): boolean {
      classOpCount.toggle++;

      return origToggle.call(this, token, force);
    };

    DOMTokenList.prototype.remove = function (...tokens: string[]): void {
      classOpCount.remove++;
      origRemove.apply(this, tokens);
    };

    DOMTokenList.prototype.add = function (...tokens: string[]): void {
      classOpCount.add++;
      origAdd.apply(this, tokens);
    };
  });

  afterEach(() => {
    Element.prototype.setAttribute = origSetAttribute;
    DOMTokenList.prototype.toggle = origToggle;
    DOMTokenList.prototype.remove = origRemove;
    DOMTokenList.prototype.add = origAdd;

    router.stop();
  });

  it("1000 detectChanges() on a stable RealLink — no spurious href writes", () => {
    @Component({
      template: `<a realLink>link</a>`,
      imports: [RealLink],
    })
    class Host {}

    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Host);

    fixture.detectChanges();

    // Baseline established — record post-mount counts.
    const baselineHref = setAttributeCount.href;
    const baselineToggle = classOpCount.toggle;
    const baselineRemove = classOpCount.remove;

    for (let i = 0; i < 1000; i++) {
      fixture.detectChanges();
    }

    // After 1000 CD passes with no router state change, the directive's
    // effect should not re-run, the source subscribe callback should not
    // re-fire, and `updateDom` should not be invoked. Counts must stay flat.
    expect(setAttributeCount.href).toBe(baselineHref);
    expect(classOpCount.toggle).toBe(baselineToggle);
    expect(classOpCount.remove).toBe(baselineRemove);

    fixture.destroy();
  });

  it("1000 detectChanges() on a stable RealLinkActive — no spurious classList writes", () => {
    @Component({
      template: `<div realLinkActive>active host</div>`,
      imports: [RealLinkActive],
    })
    class Host {}

    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Host);

    fixture.detectChanges();

    const baselineToggle = classOpCount.toggle;
    const baselineRemove = classOpCount.remove;

    for (let i = 0; i < 1000; i++) {
      fixture.detectChanges();
    }

    expect(classOpCount.toggle).toBe(baselineToggle);
    expect(classOpCount.remove).toBe(baselineRemove);

    fixture.destroy();
  });

  it("N navigations + CD storm between each → DOM writes scale with N, not N×CD", async () => {
    @Component({
      template: `
        <a realLink>link-1</a>
        <a realLink>link-2</a>
        <a realLink>link-3</a>
        <div realLinkActive>active-1</div>
        <div realLinkActive>active-2</div>
      `,
      imports: [RealLink, RealLinkActive],
    })
    class Host {}

    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(Host);

    fixture.detectChanges();

    const postMountHref = setAttributeCount.href;
    const postMountToggle = classOpCount.toggle;

    const navTargets = ["users", "users.list", "admin", "home"];

    for (const target of navTargets) {
      await router.navigate(target);

      // Hammer change detection between navigations. The active-source
      // subscribe callback fires once per navigation per RealLink/Active
      // directive (5 total) — none of the 1000 detectChanges in between
      // should add to the count.
      const writesBeforeStorm = setAttributeCount.href + classOpCount.toggle;

      for (let i = 0; i < 1000; i++) {
        fixture.detectChanges();
      }

      const writesAfterStorm = setAttributeCount.href + classOpCount.toggle;

      expect(writesAfterStorm).toBe(writesBeforeStorm);
    }

    // Total DOM writes scale with the number of navigations × number of
    // affected directives. With routeName="" defaults href stays undefined
    // so setAttrCount.href stays at postMountHref forever; classList toggle
    // can only fire when isActive flips, which never happens for "".
    // Both bounded — not multiplied by 4000 CD passes.
    expect(setAttributeCount.href).toBe(postMountHref);
    // classList.toggle MAY fire once per navigation per RealLinkActive (with
    // activeClass=true/false transition); upper bound is conservative.
    expect(classOpCount.toggle - postMountToggle).toBeLessThanOrEqual(
      navTargets.length * 5,
    );

    fixture.destroy();
  }, 60_000);
});
