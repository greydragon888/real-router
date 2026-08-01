import { createRouter } from "@real-router/core";
import { describe, expect, expectTypeOf, it } from "vitest";

import { validationPlugin } from "../../src/validationPlugin";

import type { PluginFactory } from "@real-router/core";

/**
 * #1621 — the factory must carry the caller's dependency map, not the
 * `object` default.
 *
 * `DefaultDependencies` is `object`, whose `keyof` is `never`, so a bare
 * `PluginFactory` types `getDependency` as `(key: never) => never`. TypeScript 7
 * runs a variance check TypeScript 6 skips, and rejects that value where
 * `PluginFactory<D>` is expected for any `D` with an index signature — i.e.
 * `usePlugin(validationPlugin())` stops compiling for a consumer who types
 * dependencies as `Record<string, T>`.
 *
 * These are compile-time assertions: `vitest` transpiles without checking, so
 * the pin is enforced by `tsc --noEmit` (which `turbo test` depends on), and
 * the runtime bodies only prove the typed forms are real registrations.
 */
describe("validationPlugin — dependency-map variance (#1621)", () => {
  it("accepts the caller's dependency map as a type argument", () => {
    type Deps = Record<string, number>;

    // Fails to compile while the factory is non-generic: TS2558, "Expected 0
    // type arguments, but got 1". This is the pin that goes red on TS 6 too —
    // the variance rejection itself only surfaces on TS 7.
    const factory: PluginFactory<Deps> = validationPlugin<Deps>();

    expectTypeOf(factory).toEqualTypeOf<PluginFactory<Deps>>();

    const router = createRouter<Deps>([{ name: "home", path: "/" }]);

    expect(() => router.usePlugin(factory)).not.toThrow();
  });

  it("registers on a router whose dependency map has an index signature", () => {
    type Deps = Record<string, number>;

    const router = createRouter<Deps>([{ name: "home", path: "/" }]);

    // The consumer-facing shape from the issue. Inference must land on `Deps`;
    // on TS 7 the bare `PluginFactory` is not assignable here at all.
    expect(() => router.usePlugin(validationPlugin())).not.toThrow();
  });

  it("still registers with no type argument and untyped dependencies", () => {
    const router = createRouter([{ name: "home", path: "/" }]);

    expect(() => router.usePlugin(validationPlugin())).not.toThrow();
  });
});
