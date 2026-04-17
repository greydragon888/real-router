import { Component, Injector, runInInjectionContext } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { describe, it, expect } from "vitest";

import { sourceToSignal } from "../../src/sourceToSignal.js";

import type { RouterSource } from "@real-router/sources";

function createMockSource<T>(
  initial: T,
): RouterSource<T> & { emit: (value: T) => void } {
  let current = initial;
  let listener: (() => void) | null = null;
  let destroyed = false;

  return {
    getSnapshot: () => current,
    subscribe: (fn: () => void) => {
      listener = fn;

      return () => {
        listener = null;
      };
    },
    destroy: () => {
      destroyed = true;
    },
    emit: (value: T) => {
      current = value;
      listener?.();
    },
    get _destroyed() {
      return destroyed;
    },
  } as RouterSource<T> & { emit: (value: T) => void };
}

describe("sourceToSignal", () => {
  it("throws when called outside injection context", () => {
    const source = createMockSource(42);

    expect(() => sourceToSignal(source)).toThrow();
  });

  it("reads initial snapshot", () => {
    TestBed.configureTestingModule({});
    const injector = TestBed.inject(Injector);

    const source = createMockSource(42);

    let sig: ReturnType<typeof sourceToSignal<number>> | undefined;

    runInInjectionContext(injector, () => {
      sig = sourceToSignal(source);
    });

    expect(sig!()).toBe(42);
  });

  it("updates signal when source emits", () => {
    TestBed.configureTestingModule({});
    const injector = TestBed.inject(Injector);
    const source = createMockSource("hello");

    let sig: ReturnType<typeof sourceToSignal<string>> | undefined;

    runInInjectionContext(injector, () => {
      sig = sourceToSignal(source);
    });

    expect(sig!()).toBe("hello");

    source.emit("world");

    expect(sig!()).toBe("world");
  });

  it("handles rapid sequential emissions", () => {
    TestBed.configureTestingModule({});
    const injector = TestBed.inject(Injector);
    const source = createMockSource(0);

    let sig: ReturnType<typeof sourceToSignal<number>> | undefined;

    runInInjectionContext(injector, () => {
      sig = sourceToSignal(source);
    });

    for (let i = 1; i <= 100; i++) {
      source.emit(i);
    }

    expect(sig!()).toBe(100);
  });

  it("does not update signal after destroy", () => {
    @Component({ template: "" })
    class TestDestroyComponent {
      source = createMockSource(0);
      sig = sourceToSignal(this.source);
    }

    TestBed.configureTestingModule({ imports: [TestDestroyComponent] });
    const fixture = TestBed.createComponent(TestDestroyComponent);
    const component = fixture.componentInstance;

    expect(component.sig()).toBe(0);

    component.source.emit(1);

    expect(component.sig()).toBe(1);

    fixture.destroy();

    component.source.emit(999);

    expect(component.sig()).toBe(1);
  });

  it("cleans up on DestroyRef destruction", () => {
    @Component({ template: "" })
    class TestComponent {
      source = createMockSource(0);
      sig = sourceToSignal(this.source);
    }

    TestBed.configureTestingModule({ imports: [TestComponent] });
    const fixture = TestBed.createComponent(TestComponent);
    const component = fixture.componentInstance;

    expect(component.sig()).toBe(0);

    component.source.emit(1);

    expect(component.sig()).toBe(1);

    fixture.destroy();

    expect((component.source as any)._destroyed).toBe(true);
  });
});
