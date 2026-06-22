import { Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect } from "vitest";

import {
  HTTP_STATUS_SINK,
  HttpStatusCode,
  createHttpStatusSink,
  provideHttpStatusSink,
} from "@real-router/angular/ssr";

import type { HttpStatusSink } from "@real-router/angular/ssr";

/**
 * JIT-mode caveat: signal `input()` template bindings (`[code]="404"`) and
 * `componentRef.setInput("code", N)` do not propagate the value to the
 * `code()` signal in JIT — see `packages/angular/CLAUDE.md` "Coverage
 * Ceiling (~95%) — JIT Limitation". The component's ngOnInit therefore
 * always reads `undefined` for `code` in this test environment and the
 * `sink.code = value` write is unreachable. The tests below exercise the
 * JIT-reachable surface (factory, DI token, optional injection, no-provider
 * safety, no-throw rendering); the actual write-on-bind behaviour is covered
 * end-to-end via the AOT-compiled examples in
 * `examples/web/angular/ssr-examples/*` once an `<http-status-code>` consumer
 * lands there.
 */
describe("createHttpStatusSink", () => {
  it("starts with code === undefined", () => {
    const sink = createHttpStatusSink();

    expect(sink.code).toBeUndefined();
  });

  it("returns a fresh sink per call (no shared mutable state)", () => {
    const a = createHttpStatusSink();
    const b = createHttpStatusSink();

    a.code = 404;

    expect(b.code).toBeUndefined();
  });

  it("supports direct mutation (the contract entry-server reads after render)", () => {
    const sink: HttpStatusSink = createHttpStatusSink();

    sink.code = 451;

    expect(sink.code).toBe(451);

    sink.code = 503;

    expect(sink.code).toBe(503);

    sink.code = undefined;

    expect(sink.code).toBeUndefined();
  });
});

describe("provideHttpStatusSink", () => {
  it("provides the sink under HTTP_STATUS_SINK token", () => {
    const sink = createHttpStatusSink();

    TestBed.configureTestingModule({
      providers: [provideHttpStatusSink(sink)],
    });

    expect(TestBed.inject(HTTP_STATUS_SINK)).toBe(sink);
  });

  it("HTTP_STATUS_SINK is null without a provider when injected with optional", () => {
    TestBed.configureTestingModule({});

    expect(
      TestBed.inject(HTTP_STATUS_SINK, null, { optional: true }),
    ).toBeNull();
  });

  it("equivalent to explicit useValue provider", () => {
    const sinkA = createHttpStatusSink();
    const sinkB = createHttpStatusSink();

    TestBed.configureTestingModule({
      providers: [
        provideHttpStatusSink(sinkA),
        // Last provider wins in DI — verifies that provideHttpStatusSink
        // composes with the bare useValue form on the same token.
        { provide: HTTP_STATUS_SINK, useValue: sinkB },
      ],
    });

    expect(TestBed.inject(HTTP_STATUS_SINK)).toBe(sinkB);
  });
});

describe("HttpStatusCode component", () => {
  it("instantiates and renders an empty template without a provider", () => {
    TestBed.configureTestingModule({
      imports: [HttpStatusCode],
    });

    const fixture = TestBed.createComponent(HttpStatusCode);

    expect(() => {
      fixture.detectChanges();
    }).not.toThrow();
    expect(fixture.nativeElement.innerHTML.trim()).toBe("");
  });

  it("instantiates and renders an empty template with a provider", () => {
    const sink = createHttpStatusSink();

    TestBed.configureTestingModule({
      imports: [HttpStatusCode],
      providers: [provideHttpStatusSink(sink)],
    });

    const fixture = TestBed.createComponent(HttpStatusCode);

    expect(() => {
      fixture.detectChanges();
    }).not.toThrow();
    expect(fixture.nativeElement.innerHTML.trim()).toBe("");
  });

  it("undefined code (JIT default) does not overwrite a pre-existing sink value", () => {
    const sink = createHttpStatusSink();

    sink.code = 200;

    TestBed.configureTestingModule({
      imports: [HttpStatusCode],
      providers: [provideHttpStatusSink(sink)],
    });

    const fixture = TestBed.createComponent(HttpStatusCode);

    fixture.detectChanges();

    expect(sink.code).toBe(200);
  });

  it("ngOnInit writes the sink when the input has a defined value", () => {
    const sink = createHttpStatusSink();

    TestBed.configureTestingModule({
      providers: [provideHttpStatusSink(sink)],
    });

    // Bypass JIT's signal-input limitation: instantiate via the test
    // injector and patch the `code` signal getter manually before invoking
    // ngOnInit. This exercises the same code path the AOT runtime hits when
    // the template binding fires, without depending on JIT signal-input
    // propagation (which silently no-ops in this environment).
    const cmp = runInInjectionContext(
      TestBed.inject(Injector),
      () => new HttpStatusCode(),
    );

    Object.defineProperty(cmp, "code", { value: () => 404 });

    cmp.ngOnInit();

    expect(sink.code).toBe(404);
  });

  it("ngOnInit no-ops when code() returns undefined", () => {
    const sink = createHttpStatusSink();

    sink.code = 200;

    TestBed.configureTestingModule({
      providers: [provideHttpStatusSink(sink)],
    });

    const cmp = runInInjectionContext(
      TestBed.inject(Injector),
      () => new HttpStatusCode(),
    );

    Object.defineProperty(cmp, "code", { value: () => undefined });

    cmp.ngOnInit();

    expect(sink.code).toBe(200);
  });

  it("ngOnInit no-ops when no provider is registered", () => {
    TestBed.configureTestingModule({});

    const cmp = runInInjectionContext(
      TestBed.inject(Injector),
      () => new HttpStatusCode(),
    );

    Object.defineProperty(cmp, "code", { value: () => 404 });

    expect(() => {
      cmp.ngOnInit();
    }).not.toThrow();
  });

  it("multiple ngOnInit invocations — last call wins", () => {
    const sink = createHttpStatusSink();

    TestBed.configureTestingModule({
      providers: [provideHttpStatusSink(sink)],
    });

    const a = runInInjectionContext(
      TestBed.inject(Injector),
      () => new HttpStatusCode(),
    );
    const b = runInInjectionContext(
      TestBed.inject(Injector),
      () => new HttpStatusCode(),
    );
    const c = runInInjectionContext(
      TestBed.inject(Injector),
      () => new HttpStatusCode(),
    );

    Object.defineProperty(a, "code", { value: () => 404 });
    Object.defineProperty(b, "code", { value: () => 410 });
    Object.defineProperty(c, "code", { value: () => 503 });

    a.ngOnInit();
    b.ngOnInit();
    c.ngOnInit();

    expect(sink.code).toBe(503);
  });

  it("non-404 codes (410 Gone, 451 Unavailable for Legal Reasons) round-trip", () => {
    const sink = createHttpStatusSink();

    TestBed.configureTestingModule({
      providers: [provideHttpStatusSink(sink)],
    });

    const cmp = runInInjectionContext(
      TestBed.inject(Injector),
      () => new HttpStatusCode(),
    );

    Object.defineProperty(cmp, "code", { value: () => 451 });
    cmp.ngOnInit();

    expect(sink.code).toBe(451);
  });
});
