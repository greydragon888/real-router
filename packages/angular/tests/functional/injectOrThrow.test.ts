// Closes review-2026-05-10 §5.8 ⛔ edge-cases for `injectOrThrow`.
//
// The helper is also tested indirectly through every `inject*` function
// (covered in `inject-functions.test.ts`), but those tests don't exercise
// the falsy-non-null branches that the §8.1 fix changed: the original
// `if (!value)` would throw on falsy non-null values like `0`, `""`,
// `false`; the fix to `if (value === null || value === undefined)` makes
// those values pass through. This file pins the new contract.

import {
  EnvironmentInjector,
  InjectionToken,
  Injector,
  createEnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { injectOrThrow } from "../../src/functions/injectOrThrow";

describe("injectOrThrow — explicit null/undefined check (review §5.8)", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  // Audit gap: value === null → throws (matches null-check branch).
  it("token registered with useValue: null → throws", () => {
    const TOKEN = new InjectionToken<unknown>("NULL_TOKEN");

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TOKEN, useValue: null }],
    });

    const injector = TestBed.inject(Injector);

    expect(() => {
      runInInjectionContext(injector, () => {
        injectOrThrow(TOKEN, "testFn");
      });
    }).toThrow(/testFn must be used within a provideRealRouter context/);
  });

  // Audit gap: value === undefined / token unregistered → throws.
  it("token not registered → throws (returns undefined via inject({optional}))", () => {
    const TOKEN = new InjectionToken<unknown>("UNREGISTERED_TOKEN");
    const injector = TestBed.inject(Injector);

    expect(() => {
      runInInjectionContext(injector, () => {
        injectOrThrow(TOKEN, "testFn");
      });
    }).toThrow(/testFn must be used within a provideRealRouter context/);
  });

  // Audit gap: value === 0 / "" (falsy non-null) → previously THREW with
  // the old `if (!value)` check; the §8.1 fix uses
  // `value === null || value === undefined` so legitimate falsy values now
  // pass through. Pin both 0 and "" since both are common future-proofing
  // cases (tokens that hold primitives in test/mock scenarios).
  it("token registered with useValue: 0 → returns 0 (falsy passthrough)", () => {
    const TOKEN = new InjectionToken<number>("ZERO_TOKEN");

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TOKEN, useValue: 0 }],
    });

    const injector = TestBed.inject(Injector);

    const result = runInInjectionContext(injector, () =>
      injectOrThrow(TOKEN, "testFn"),
    );

    expect(result).toBe(0);
  });

  it('token registered with useValue: "" → returns "" (falsy passthrough)', () => {
    const TOKEN = new InjectionToken<string>("EMPTY_STRING_TOKEN");

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TOKEN, useValue: "" }],
    });

    const injector = TestBed.inject(Injector);

    const result = runInInjectionContext(injector, () =>
      injectOrThrow(TOKEN, "testFn"),
    );

    expect(result).toBe("");
  });

  it("token registered with useValue: false → returns false (falsy passthrough)", () => {
    const TOKEN = new InjectionToken<boolean>("FALSE_TOKEN");

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TOKEN, useValue: false }],
    });

    const injector = TestBed.inject(Injector);

    const result = runInInjectionContext(injector, () =>
      injectOrThrow(TOKEN, "testFn"),
    );

    expect(result).toBe(false);
  });

  // Sanity: error message includes the fnName argument verbatim.
  it("error message includes the fnName argument", () => {
    const TOKEN = new InjectionToken<unknown>("MISSING_TOKEN");
    const injector = TestBed.inject(Injector);

    expect(() => {
      runInInjectionContext(injector, () => {
        injectOrThrow(TOKEN, "myCustomFnName");
      });
    }).toThrow(
      /^myCustomFnName must be used within a provideRealRouter context$/,
    );
  });
});

// Closes review-2026-05-10 §5.10 ⛔ LOW "runInInjectionContext nested isolation".
// Verifies that nested `runInInjectionContext(injectorA, () => {
//   runInInjectionContext(injectorB, () => { inject(...) })
// })` correctly switches the active injection context to the INNER injector
// for the nested callback, then restores the outer when the inner returns.
// This is a standard Angular invariant but worth pinning at the adapter
// boundary since `injectOrThrow` reads via `inject(token, { optional: true })`
// and consumers may compose contexts.
describe("runInInjectionContext nested isolation (review §5.10 LOW)", () => {
  it("nested contexts: inner reads from inner injector, outer restored after inner returns", () => {
    const TOKEN = new InjectionToken<string>("TOKEN_FOR_ISOLATION");

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TOKEN, useValue: "outer-value" }],
    });

    const outerInjector = TestBed.inject(EnvironmentInjector);

    // Inner injector — child environment with its own TOKEN binding.
    // Created via `createEnvironmentInjector` to avoid destroying the
    // outer injector (TestBed.resetTestingModule would tear down outer).
    const innerInjector = createEnvironmentInjector(
      [{ provide: TOKEN, useValue: "inner-value" }],
      outerInjector,
    );

    const observed: string[] = [];

    runInInjectionContext(outerInjector, () => {
      observed.push(injectOrThrow(TOKEN, "outerRead"));

      runInInjectionContext(innerInjector, () => {
        observed.push(injectOrThrow(TOKEN, "innerRead"));
      });

      // After nested returns, outer context is restored.
      observed.push(injectOrThrow(TOKEN, "outerAgain"));
    });

    expect(observed).toStrictEqual([
      "outer-value",
      "inner-value",
      "outer-value",
    ]);

    innerInjector.destroy();
  });

  it("nested context isolation: throwing inside inner does not leave the outer context broken", () => {
    const TOKEN = new InjectionToken<string>("THROW_TOKEN");

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: TOKEN, useValue: "outer" }],
    });

    const outerInjector = TestBed.inject(EnvironmentInjector);
    // Inner has NO provider for TOKEN; but it inherits from outer →
    // injectOrThrow would normally find the outer's TOKEN. To make the
    // inner truly miss, use a SIBLING injector instead (no parent
    // relationship): create from the EnvironmentInjector but provide a
    // null-binding to shadow the outer. Easier: use a different TOKEN
    // that's only provided by outer, never reach inner — pin only the
    // outer-restoration property.
    const SHADOW_TOKEN = new InjectionToken<string>("SHADOW_TOKEN");
    const innerInjector = createEnvironmentInjector(
      // Inner overrides SHADOW_TOKEN with null → injectOrThrow throws.
      [{ provide: SHADOW_TOKEN, useValue: null }],
      outerInjector,
    );

    let outerAfter: string | undefined;

    runInInjectionContext(outerInjector, () => {
      expect(() => {
        runInInjectionContext(innerInjector, () => {
          injectOrThrow(SHADOW_TOKEN, "innerRead");
        });
      }).toThrow(/innerRead must be used within a provideRealRouter context/);

      // Outer context restored after inner threw.
      outerAfter = injectOrThrow(TOKEN, "outerRead");
    });

    expect(outerAfter).toBe("outer");

    innerInjector.destroy();
  });
});
