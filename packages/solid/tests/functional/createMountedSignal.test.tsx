// packages/solid/tests/functional/createMountedSignal.test.tsx

/**
 * Functional tests for `createMountedSignal` — the SSR/CSR boundary
 * primitive consumed by `<ClientOnly>`/`<ServerOnly>` (audit-2026-05-17
 * §6 Stage-2 #18). Lives in functional (jsdom) rather than property/
 * (node) because `onMount` requires a DOM owner to fire.
 *
 * Invariants:
 *
 * - **Initial value `false`** — at the moment the signal is created the
 *   accessor reads `false`. Solid runs `onMount` callbacks AFTER the
 *   initial render commits, so any read inside the component body (or
 *   immediately after `createMountedSignal()`) must see `false`.
 *
 * - **Mounted flip is irreversible** — once `setMounted(true)` has fired,
 *   the accessor stays `true` for the entire owner's lifetime. The signal
 *   only flips one way; there is no exposed setter.
 *
 * - **N consecutive calls return distinct signals** — `createMountedSignal`
 *   is not memoised; calling it twice creates two independent accessors,
 *   each tied to its own onMount lifecycle.
 *
 * Critical because the `<ClientOnly>` / `<ServerOnly>` SSR boundary
 * contract collapses if the signal starts at `true` (no SSR-side branch
 * ever renders) or if it flips back to `false` mid-session (hydration
 * mismatch on subsequent renders).
 */

import { renderHook } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { createMountedSignal } from "../../src/utils/createMountedSignal";

describe("createMountedSignal", () => {
  it("Invariant 1: read inside component body before onMount returns false", () => {
    let initialRead: boolean | undefined;

    renderHook(() => {
      const mounted = createMountedSignal();

      initialRead = mounted();

      return mounted;
    });

    expect(initialRead).toBe(false);
  });

  it("Invariant 2: accessor reads `true` after onMount fires", () => {
    const { result } = renderHook(() => createMountedSignal());

    expect(result()).toBe(true);
  });

  it("Invariant 3: irreversibility — repeated reads after mount return true", () => {
    const { result } = renderHook(() => createMountedSignal());

    for (let i = 0; i < 10; i++) {
      expect(result()).toBe(true);
    }
  });

  it("Invariant 4: two createMountedSignal calls in the same owner produce distinct accessors", () => {
    const { result } = renderHook(() => {
      const a = createMountedSignal();
      const b = createMountedSignal();

      return { a, b };
    });

    expect(result.a).not.toBe(result.b);
    expect(result.a()).toBe(true);
    expect(result.b()).toBe(true);
  });
});
