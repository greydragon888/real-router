import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { validationPlugin } from "../../src";
import { resetUndeclaredParamKeyReports } from "../../src/validators/state";

import type { Router } from "@real-router/core";

/**
 * The undeclared-params-bag diagnostic (#1579 — the params half of #1553).
 *
 * A key the route declares NOWHERE — neither as a path slot (`/user/:id`) nor
 * with `?` — has no channel to belong to. Core keeps it in `state.params` on
 * purpose: it is app-level data, documented as such (wiki `Route.md`, "an
 * arbitrary default … is app-level data, not part of the URL"). What it is NOT
 * is part of the URL, so the state does not round-trip through its own
 * `state.path` — reopening the same link loses the key.
 *
 * ⚠ Core's behaviour is deliberately UNCHANGED. Dropping the key was the
 * original proposal and was rejected on measurement: it retires a shipped,
 * documented capability (52 tests across 6 packages, plus the wiki), and the
 * "declared nowhere" predicate cannot tell that case apart from a legitimate
 * one — `navigate("users", { id })` on a parent route whose CHILD declares
 * `:id` looks identical to it. So this is a diagnostic, never a gate: the
 * asymmetry stops being a surprise without anything being taken away.
 *
 * Same shape as the mode gate's diagnostic (#1575): core always behaves the
 * same, `validation-plugin` makes it visible, de-duplicated per route + key.
 */
const ROUTES = [
  { name: "h", path: "/h" },
  { name: "plain", path: "/plain" },
  { name: "slot", path: "/slot/:id" },
  { name: "dec", path: "/dec?a" },
];

let router: Router;
let warnSpy: ReturnType<typeof vi.spyOn>;

function mk(): Router {
  const instance = createRouter(ROUTES);

  instance.usePlugin(validationPlugin());

  return instance;
}

describe("validation-plugin — undeclared params-bag key diagnostic (#1579)", () => {
  beforeEach(() => {
    // Module-level de-dup cache outlives a router: a stale entry would silence
    // the very warning under test.
    resetUndeclaredParamKeyReports();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    router.stop();
  });

  it("warns that an undeclared key will not reach the URL", async () => {
    router = mk();
    await router.start("/h");

    const state = await router.navigate("plain", { foo: "1" });

    // Behaviour is UNCHANGED — the key still lives in state.params.
    expect(state.params).toStrictEqual({ foo: "1" });
    expect(state.path).toBe("/plain");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(`"foo"`));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(`"plain"`));
  });

  it("stays silent for a key the route declares — in EITHER channel", async () => {
    router = mk();
    await router.start("/h");

    // A path slot…
    await router.navigate("slot", { id: "7" });
    // …and a query declaration.
    await router.navigate("dec", {}, { a: "1" });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("de-duplicates per route + key", async () => {
    router = mk();
    await router.start("/h");

    await router.navigate("plain", { foo: "1" });
    await router.navigate("h");
    await router.navigate("plain", { foo: "2" }, undefined, { reload: true });

    // Same route + key twice → one warning. Without the de-dup a revisited
    // route floods the console.
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("stays silent on every PREDICATE, including canNavigateTo", async () => {
    router = mk();
    await router.start("/h");

    // The render path must not warn once per <Link>. `canNavigateTo` is the
    // trap here: it RESOLVES forwardTo, so it shares the compositional form with
    // `navigate` — a form-based test caught it and warned (measured). The
    // diagnostic is therefore opted into explicitly by the committing producers,
    // not inferred from the form.
    router.canNavigateTo("plain", { foo: "1" });
    router.buildPath("plain", { foo: "1" });
    router.isActiveRoute("plain", { foo: "1" });
    getPluginApi(router).makeState("plain", { foo: "1" });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("stays silent on the URL direction (matchPath)", async () => {
    router = mk();
    await router.start("/h");

    // An undeclared key arriving from a URL lands in the QUERY channel, where
    // the mode gate (#1575) already owns the decision — this diagnostic is about
    // the params bag only, so it must not double-report.
    getPluginApi(router).matchPath("/plain?foo=1");

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("says nothing when the plugin is absent (core stays silent)", async () => {
    router = createRouter(ROUTES);
    await router.start("/h");

    const state = await router.navigate("plain", { foo: "1" });

    expect(state.params).toStrictEqual({ foo: "1" });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
