/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
// RealLink / RealLinkActive under REAL AOT compilation (#1512 layer 2).
//
// In the jit project these directives' signal-input bindings are rejected
// (NG0303) and `routeName` stays at its "" default, so the subscription
// callback never sees an active-state flip, `buildHref` never yields an href,
// and the class-toggle paths are unreachable (CLAUDE.md "Coverage Ceiling").
// Here the bindings compile for real: active flips fire the source
// subscription (also covering `subscribeSourceToSignal`'s emission callback),
// href lands on the anchor, and the class add/remove transitions execute.
import { Component, signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter, type Params } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RealLink } from "../../src/directives/RealLink";
import { RealLinkActive } from "../../src/directives/RealLinkActive";
import { provideRealRouter } from "../../src/providers";

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

describe("RealLink / RealLinkActive (AOT)", () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  function mount<T>(host: new () => T) {
    TestBed.configureTestingModule({
      imports: [host],
      providers: [provideRealRouter(router)],
    });
    const fixture = TestBed.createComponent(host);

    fixture.detectChanges();

    return fixture;
  }

  it("realLink binds routeName → href lands on the anchor", () => {
    @Component({
      template: `<a realLink [routeName]="'users'">Users</a>`,
      imports: [RealLink],
    })
    class TestHost {}

    const fixture = mount(TestHost);
    const anchor = fixture.nativeElement.querySelector(
      "a",
    ) as HTMLAnchorElement;

    // The initial snapshot fires updateHref synchronously inside the first
    // effect flush — no navigation needed.
    expect(anchor.getAttribute("href")).toBe("/users");
  });

  it("realLink binds a `to` descriptor → href decomposes name/params (#1548)", () => {
    // The descriptor form is only reachable under AOT — a signal `[to]` input
    // stays at its `undefined` default under JIT, so the `resolveLinkTarget`
    // descriptor arm never runs there.
    @Component({
      template: `<a
        realLink
        [to]="{ name: 'users.profile', params: { id: '7' } }"
        >Profile</a
      >`,
      imports: [RealLink],
    })
    class TestHost {}

    const fixture = mount(TestHost);
    const anchor = fixture.nativeElement.querySelector(
      "a",
    ) as HTMLAnchorElement;

    // href resolves from the descriptor's { name, params }, not the (absent)
    // channel props.
    expect(anchor.getAttribute("href")).toBe("/users/7");
  });

  it("realLink `to` click navigates via the decomposed descriptor (#1548)", async () => {
    // Covers `onClick` under AOT (the jit twin exists, but the AOT-emit onClick
    // is only reached by a real click here — the other AOT tests drive
    // navigation through `router.navigate()` directly).
    @Component({
      template: `<a
        realLink
        [to]="{ name: 'users.profile', params: { id: '9' } }"
        >Go</a
      >`,
      imports: [RealLink],
    })
    class TestHost {}

    const fixture = mount(TestHost);
    const anchor = fixture.nativeElement.querySelector(
      "a",
    ) as HTMLAnchorElement;

    anchor.dispatchEvent(new MouseEvent("click", { cancelable: true }));
    await fixture.whenStable();

    // The descriptor's { name, params } drove navigation.
    expect(router.getState()?.name).toBe("users.profile");
    expect(router.getState()?.params).toStrictEqual({ id: "9" });
  });

  it("active-state flip toggles the active class via the source subscription", async () => {
    @Component({
      template: `<a realLink [routeName]="'users'">Users</a>`,
      imports: [RealLink],
    })
    class TestHost {}

    const fixture = mount(TestHost);
    const anchor = fixture.nativeElement.querySelector(
      "a",
    ) as HTMLAnchorElement;

    expect(anchor.classList.contains("active")).toBe(false);

    // The subscription callback fires synchronously from navigate() — the
    // classList is written directly, no CD pass required.
    await router.navigate("users");

    expect(anchor.classList.contains("active")).toBe(true);

    await router.navigate("home");

    expect(anchor.classList.contains("active")).toBe(false);
  });

  it("pure-href refresh: params change with unchanged active flag skips the classList work", async () => {
    @Component({
      template: `<a realLink [routeName]="'users.profile'" [routeParams]="p()"
        >P</a
      >`,
      imports: [RealLink],
    })
    class TestHost {
      readonly p = signal<Params>({ id: "1" });
    }

    const fixture = mount(TestHost);
    const anchor = fixture.nativeElement.querySelector(
      "a",
    ) as HTMLAnchorElement;

    expect(anchor.getAttribute("href")).toBe("/users/1");

    // Content-different params re-run the source-creation effect; the fresh
    // source's initial snapshot reports the SAME inactive flag → the
    // `snap === prevActive` early-return branch runs (href refresh only).
    fixture.componentInstance.p.set({ id: "2" });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(anchor.getAttribute("href")).toBe("/users/2");
    expect(anchor.classList.contains("active")).toBe(false);
  });

  it("activeClassName change is applied on the next flip and removes the stale class", async () => {
    @Component({
      template: `<a realLink [routeName]="'users'" [activeClassName]="cls()"
        >U</a
      >`,
      imports: [RealLink],
    })
    class TestHost {
      readonly cls = signal("active");
    }

    const fixture = mount(TestHost);
    const anchor = fixture.nativeElement.querySelector(
      "a",
    ) as HTMLAnchorElement;

    await router.navigate("users");

    expect(anchor.classList.contains("active")).toBe(true);

    // activeClassName is NOT read by the source-creation effect — changing it
    // takes effect on the next active flip, where updateActiveClass sees
    // prevActiveClass !== activeClass and removes the stale one.
    fixture.componentInstance.cls.set("current");
    fixture.detectChanges();
    await fixture.whenStable();

    expect(anchor.classList.contains("active")).toBe(true);

    await router.navigate("home");

    expect(anchor.classList.contains("active")).toBe(false);
    expect(anchor.classList.contains("current")).toBe(false);
  });

  it("realLinkActive toggles its custom class on active flips", async () => {
    @Component({
      template: `<div [realLinkActive]="'hl'" routeName="users">tab</div>`,
      imports: [RealLinkActive],
    })
    class TestHost {}

    const fixture = mount(TestHost);
    const div = fixture.nativeElement.querySelector("div") as HTMLElement;

    expect(div.classList.contains("hl")).toBe(false);

    await router.navigate("users");

    expect(div.classList.contains("hl")).toBe(true);

    await router.navigate("home");

    expect(div.classList.contains("hl")).toBe(false);
  });

  it("realLinkActive same-snap re-subscription takes the early return", async () => {
    @Component({
      template: `
        <div [realLinkActive]="'hl'" routeName="users" [routeParams]="p()">
          tab
        </div>
      `,
      imports: [RealLinkActive],
    })
    class TestHost {
      readonly p = signal<Params>({ q: "1" });
    }

    const fixture = mount(TestHost);
    const div = fixture.nativeElement.querySelector("div") as HTMLElement;

    // Inactive before and after: the effect re-run's initial snapshot equals
    // prevActive → the `snap === this.prevActive` early return executes.
    fixture.componentInstance.p.set({ q: "2" });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(div.classList.contains("hl")).toBe(false);
  });
});
