/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
// RouteView fallback-template resolution under REAL AOT compilation (#1512).
//
// These fixtures are structurally unreachable in the jit project: without a
// compiler transform, `contentChildren()` signal queries never register, so
// `selfs()` / `notFounds()` stay `[]` there (CLAUDE.md "Coverage Ceiling").
// This file runs in the vitest "aot" project, where
// @analogjs/vite-plugin-angular compiles the hosts ahead-of-time and the
// queries populate for real. Duplicate-marker fixtures live ONLY here — added
// to the jit suite they would fail (empty queries), correctly.
//
// Case IDs (K0/S1/S2/M1-M4) map to the fixture matrix in RFC #1439 §5 and RFC
// #1512 §4.4 (`.claude/rfc-1512-aot-unit-coverage-ru.md`).
import { Component, type Type } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { createRouter, UNKNOWN_ROUTE } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouteView } from "../../src/components/RouteView";
import { RouteMatch } from "../../src/directives/RouteMatch";
import { RouteNotFound } from "../../src/directives/RouteNotFound";
import { RouteSelf } from "../../src/directives/RouteSelf";
import { provideRealRouter } from "../../src/providers";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

describe("RouteView fallback resolution (AOT)", () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  function mount(host: Type<unknown>) {
    TestBed.configureTestingModule({
      imports: [host],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(host);

    // First CD BEFORE any navigation: the source-creation effect's first run
    // applies the initial snapshot inside this pass (a re-entrant
    // detectChanges() there would throw — see RouteView's constructor).
    fixture.detectChanges();

    const view = fixture.debugElement.query(By.directive(RouteView))
      .componentInstance as RouteView;

    return { fixture, view };
  }

  // K0 — environment canary. MUST stay the first test of the file: if the AOT
  // transform silently degrades (plugin dropped, transform not applied), this
  // fails with a diagnosable signal — instead of every behavioural test
  // failing in a fan-out (or worse, passing vacuously).
  it("K0: AOT compilation registers contentChildren marker queries", async () => {
    @Component({
      template: `
        <route-view>
          <ng-template routeNotFound
            ><span class="first-nf">A</span></ng-template
          >
          <ng-template routeNotFound
            ><span class="last-nf">B</span></ng-template
          >
        </route-view>
      `,
      imports: [RouteView, RouteNotFound],
    })
    class TestHost {}

    const { fixture, view } = mount(TestHost);

    await fixture.whenStable();

    expect(view.notFounds()).toHaveLength(2);
  });

  it("S2: single routeNotFound renders on UNKNOWN_ROUTE (notFound-arm)", async () => {
    @Component({
      template: `
        <route-view>
          <ng-template routeMatch="home"
            ><span class="home">H</span></ng-template
          >
          <ng-template routeNotFound><span class="nf">404</span></ng-template>
        </route-view>
      `,
      imports: [RouteView, RouteMatch, RouteNotFound],
    })
    class TestHost {}

    const { fixture, view } = mount(TestHost);

    router.navigateToNotFound("/missing");
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector(".nf")).not.toBeNull();
    expect(view.activeTemplate()).toBe(view.notFounds().at(0)?.templateRef);
  });

  it("S1: single routeSelf renders when route === nodeName (self-arm); non-matching Match falls through", async () => {
    @Component({
      template: `
        <route-view [routeNode]="'users'">
          <ng-template routeMatch="profile"
            ><span class="profile">P</span></ng-template
          >
          <ng-template routeSelf><span class="self">LIST</span></ng-template>
        </route-view>
      `,
      imports: [RouteView, RouteMatch, RouteSelf],
    })
    class TestHost {}

    const { fixture, view } = mount(TestHost);

    await router.navigate("users");
    fixture.detectChanges();
    await fixture.whenStable();

    // The "profile" match entry was evaluated (nodeName-prefixed segment) and
    // rejected — the cascade fell through to the Self slot.
    expect(view.matches()).toHaveLength(1);
    expect(fixture.nativeElement.querySelector(".profile")).toBeNull();
    expect(fixture.nativeElement.querySelector(".self")).not.toBeNull();
    expect(view.activeTemplate()).toBe(view.selfs().at(0)?.templateRef);
  });

  it("M1 (#1439): duplicate routeNotFound — the FIRST declared renders, the second is ignored", async () => {
    @Component({
      template: `
        <route-view>
          <ng-template routeNotFound
            ><span class="first-nf">A</span></ng-template
          >
          <ng-template routeNotFound
            ><span class="last-nf">B</span></ng-template
          >
        </route-view>
      `,
      imports: [RouteView, RouteNotFound],
    })
    class TestHost {}

    const { fixture, view } = mount(TestHost);

    router.navigateToNotFound("/missing");
    fixture.detectChanges();
    await fixture.whenStable();

    // Identity, not count: last-wins would pass a count-only assertion too.
    expect(fixture.nativeElement.querySelector(".first-nf")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".last-nf")).toBeNull();
    expect(view.activeTemplate()).toBe(view.notFounds().at(0)?.templateRef);
  });

  it("M2: duplicate routeSelf — the FIRST declared renders, the second is ignored", async () => {
    @Component({
      template: `
        <route-view [routeNode]="'users'">
          <ng-template routeSelf><span class="first-self">A</span></ng-template>
          <ng-template routeSelf><span class="last-self">B</span></ng-template>
        </route-view>
      `,
      imports: [RouteView, RouteSelf],
    })
    class TestHost {}

    const { fixture, view } = mount(TestHost);

    await router.navigate("users");
    fixture.detectChanges();
    await fixture.whenStable();

    expect(view.selfs()).toHaveLength(2);
    expect(fixture.nativeElement.querySelector(".first-self")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".last-self")).toBeNull();
    expect(view.activeTemplate()).toBe(view.selfs().at(0)?.templateRef);
  });

  it("M3: an activating Match suppresses both fallback slots (and exercises matchEntries)", async () => {
    @Component({
      template: `
        <route-view>
          <ng-template routeMatch="users"
            ><span class="match-hit">M</span></ng-template
          >
          <ng-template routeSelf><span class="self-hit">S</span></ng-template>
          <ng-template routeNotFound
            ><span class="nf-hit">404</span></ng-template
          >
        </route-view>
      `,
      imports: [RouteView, RouteMatch, RouteSelf, RouteNotFound],
    })
    class TestHost {}

    const { fixture, view } = mount(TestHost);

    await router.navigate("users");
    fixture.detectChanges();
    await fixture.whenStable();

    expect(view.matches()).toHaveLength(1);
    expect(fixture.nativeElement.querySelector(".match-hit")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".self-hit")).toBeNull();
    expect(fixture.nativeElement.querySelector(".nf-hit")).toBeNull();
    expect(view.activeTemplate()).toBe(view.matches().at(0)?.templateRef);
  });

  it("M4-strict: Self beats NotFound when nodeName === UNKNOWN_ROUTE (mirror of solid Inv 12)", async () => {
    @Component({
      template: `
        <route-view [routeNode]="unknownRoute">
          <ng-template routeSelf><span class="self-hit">S</span></ng-template>
          <ng-template routeNotFound
            ><span class="nf-hit">404</span></ng-template
          >
        </route-view>
      `,
      imports: [RouteView, RouteSelf, RouteNotFound],
    })
    class TestHost {
      readonly unknownRoute = UNKNOWN_ROUTE;
    }

    const { fixture, view } = mount(TestHost);

    router.navigateToNotFound("/missing");
    fixture.detectChanges();
    await fixture.whenStable();

    // Both guards are true (routeName === nodeName === UNKNOWN_ROUTE); the
    // Self arm is consulted first and must win.
    expect(fixture.nativeElement.querySelector(".self-hit")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".nf-hit")).toBeNull();
    expect(view.activeTemplate()).toBe(view.selfs().at(0)?.templateRef);
  });
});
