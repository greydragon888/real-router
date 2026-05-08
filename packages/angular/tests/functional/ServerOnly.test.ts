/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
import { Component } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { describe, it, expect } from "vitest";

import { ServerOnly } from "../../src/components/ServerOnly";

/**
 * JIT-mode caveat: signal `input()` template bindings (`[fallback]="tpl"`)
 * fail silently in JIT (NG0303) — see `packages/angular/CLAUDE.md` "Coverage
 * Ceiling (~95%) — JIT Limitation". The post-mount swap to the bound
 * `<ng-template>` is reachable only with AOT compilation. These tests
 * exercise the JIT-reachable surface: the `mounted` signal flips after the
 * first render and the @if branches resolve correctly.
 */
describe("ServerOnly component", () => {
  it("hides children after the next render when no fallback is bound", async () => {
    @Component({
      template: `
        <server-only>
          <span class="children">server content</span>
        </server-only>
      `,
      imports: [ServerOnly],
    })
    class TestHost {}

    TestBed.configureTestingModule({ imports: [TestHost] });
    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const debug = fixture.debugElement.query(By.directive(ServerOnly));
    const cmp = debug.componentInstance as ServerOnly;

    expect(cmp.mounted()).toBe(true);
    expect(cmp.fallback()).toBeUndefined();
    expect(fixture.nativeElement.textContent).not.toContain("server content");
  });

  it("exposes mounted and fallback as signal getters on the instance", () => {
    @Component({
      template: `<server-only></server-only>`,
      imports: [ServerOnly],
    })
    class TestHost {}

    TestBed.configureTestingModule({ imports: [TestHost] });
    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();

    const debug = fixture.debugElement.query(By.directive(ServerOnly));
    const cmp = debug.componentInstance as ServerOnly;

    expect(typeof cmp.mounted).toBe("function");
    expect(typeof cmp.fallback).toBe("function");
  });
});
