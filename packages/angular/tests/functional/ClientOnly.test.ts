/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { describe, it, expect } from "vitest";

import { ClientOnly } from "@real-router/angular/ssr";

/**
 * JIT-mode caveat: signal `input()` template bindings (`[fallback]="tpl"`)
 * fail silently in JIT (NG0303) — see `packages/angular/CLAUDE.md` "Coverage
 * Ceiling (~95%) — JIT Limitation". The post-mount swap to the bound
 * `<ng-template>` is reachable only with AOT compilation. These tests
 * exercise the JIT-reachable surface: the `mounted` signal flips after the
 * first render and the @if branches resolve correctly.
 */
describe("ClientOnly component", () => {
  it("renders projected children after the next render", async () => {
    @Component({
      template: `
        <client-only>
          <span class="children">client content</span>
        </client-only>
      `,
      imports: [ClientOnly],
    })
    class TestHost {}

    TestBed.configureTestingModule({ imports: [TestHost] });
    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const debug = fixture.debugElement.query(By.directive(ClientOnly));
    const cmp = debug.componentInstance as ClientOnly;

    expect(cmp.mounted()).toBe(true);
    expect(cmp.fallback()).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain("client content");
  });

  it("exposes mounted and fallback as signal getters on the instance", () => {
    @Component({
      template: `<client-only></client-only>`,
      imports: [ClientOnly],
    })
    class TestHost {}

    TestBed.configureTestingModule({ imports: [TestHost] });
    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();

    const debug = fixture.debugElement.query(By.directive(ClientOnly));
    const cmp = debug.componentInstance as ClientOnly;

    // Signal getters are callable and return concrete values.
    // In jsdom afterNextRender() fires synchronously during detectChanges,
    // so mounted() is true here; fallback() is undefined (no [fallback]
    // template bound — JIT does not propagate signal inputs).
    expect(cmp.mounted()).toBe(true);
    expect(cmp.fallback()).toBeUndefined();
  });
});
