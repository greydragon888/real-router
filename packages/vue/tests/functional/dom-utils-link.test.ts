import { createRouter } from "@real-router/core";
import { describe, it, expect, vi } from "vitest";

import {
  applyLinkA11y,
  buildActiveClassName,
  buildHref,
  shallowEqual,
  shouldNavigate,
} from "../../src/dom-utils";

import type { Router } from "@real-router/core";

// Edge-case unit tests for the shared dom-utils helpers consumed by the Vue
// adapter. The shared property-test suite lives in @real-router/react; these
// tests pin Vue-specific call shapes and gotchas (review-2026-04-17 §2.4-2.6).

describe("buildHref — params edge cases", () => {
  function makeRouter(): Router {
    const router = createRouter([
      { name: "users", path: "/users" },
      { name: "users.view", path: "/users/:id" },
    ]);

    void router.start("/users");

    return router;
  }

  it("returns undefined and logs once when a required path param is undefined", () => {
    // path-matcher's `buildPath` rejects `undefined` for a required `:id` —
    // buildHref catches the throw, logs once, and returns undefined so the
    // <a> renders without an href. Pinning current behavior.
    const router = makeRouter();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(buildHref(router, "users.view", { id: undefined })).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      '[real-router] Route "users.view" is not defined. The element will render without an href attribute.',
    );

    consoleError.mockRestore();
    router.stop();
  });

  it("returns undefined when a required path param is null", () => {
    const router = makeRouter();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(buildHref(router, "users.view", { id: null })).toBeUndefined();

    consoleError.mockRestore();
    router.stop();
  });

  it("ignores extraneous keys with undefined values that are not part of the path", () => {
    const router = makeRouter();

    // `extra` is not in the route path — undefined value must not poison the
    // result. Expected: `/users` with no query string.
    expect(buildHref(router, "users", { extra: undefined })).toBe("/users");

    router.stop();
  });

  it("ignores undefined extra alongside a required path param", () => {
    const router = makeRouter();

    // Required param `id` is provided; `extra: undefined` must be filtered out
    // rather than serialised as a query param or poisoning the path template.
    expect(
      buildHref(router, "users.view", { id: "42", extra: undefined }),
    ).toBe("/users/42");

    router.stop();
  });
});

describe("buildActiveClassName — token edge cases", () => {
  it("does not treat `active-link` as `active` (token boundary, no substring confusion)", () => {
    // base contains a token that *contains* the active class as a substring.
    // parseTokens splits on whitespace, so the dedupe set only sees full
    // tokens — the active class is appended verbatim.
    expect(buildActiveClassName(true, "active", "active-link")).toBe(
      "active-link active",
    );
  });

  it("normalizes leading/trailing/repeated whitespace in base into canonical form", () => {
    expect(buildActiveClassName(true, "active", "  foo  bar  ")).toBe(
      "foo bar active",
    );
  });

  it("normalizes whitespace even when isActive is false (canonical pass-through)", () => {
    // When inactive, the helper still returns the base. Document the current
    // behavior: pass-through (no normalization) — symmetric with React.
    expect(buildActiveClassName(false, "active", "  foo  bar  ")).toBe(
      "  foo  bar  ",
    );
  });

  it("dedupes the active token when it already appears in base", () => {
    expect(buildActiveClassName(true, "active", "foo active bar")).toBe(
      "foo active bar",
    );
  });
});

describe("applyLinkA11y — custom elements and web components", () => {
  it("applies role=link and tabindex=0 to a generic element (e.g., <div>)", () => {
    const div = document.createElement("div");

    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("applies role=link and tabindex=0 to a custom-element-like tag (web component shape)", () => {
    // JSDOM does not require customElements.define to construct an unknown
    // tag — the resulting element is still an HTMLElement (not anchor/button)
    // and falls through the same branch as a custom element in production.
    const customElement = document.createElement("my-fancy-link");

    applyLinkA11y(customElement);

    expect(customElement.getAttribute("role")).toBe("link");
    expect(customElement.getAttribute("tabindex")).toBe("0");
  });

  it("does NOT overwrite an existing role attribute on a custom element", () => {
    const customElement = document.createElement("my-fancy-link");

    customElement.setAttribute("role", "button");

    applyLinkA11y(customElement);

    expect(customElement.getAttribute("role")).toBe("button");
    expect(customElement.getAttribute("tabindex")).toBe("0");
  });

  it("skips <a> and <button> elements (already accessible)", () => {
    const anchor = document.createElement("a");
    const button = document.createElement("button");

    applyLinkA11y(anchor);
    applyLinkA11y(button);

    expect(anchor.hasAttribute("role")).toBe(false);
    expect(anchor.hasAttribute("tabindex")).toBe(false);
    expect(button.hasAttribute("role")).toBe(false);
    expect(button.hasAttribute("tabindex")).toBe(false);
  });

  // Review §5.6 — defensive null/undefined guards (no throw).
  it("is a no-op when given null (defensive guard)", () => {
    // Documented contract: `applyLinkA11y(null)` must not throw — the helper
    // is invoked from refs that may briefly be null during teardown.
    expect(() => {
      applyLinkA11y(null);
    }).not.toThrow();
  });

  it("is a no-op when given undefined (defensive guard)", () => {
    expect(() => {
      applyLinkA11y(undefined);
    }).not.toThrow();
  });

  // TODO: known issue — see review §5.6 M15. `applyLinkA11y` treats every
  // non-<a>/<button> element as a link, even <input> and <select>. CLAUDE.md
  // contract documents only a/button as skipped — the default branch fires
  // for every other tag, producing technically-incorrect a11y. Locking the
  // current behavior here as a regression so a future fix is intentional.
  it("applies role=link and tabindex=0 to <input> (default branch — incorrect a11y, locked as regression)", () => {
    const input = document.createElement("input");

    applyLinkA11y(input);

    expect(input.getAttribute("role")).toBe("link");
    expect(input.getAttribute("tabindex")).toBe("0");
  });

  // TODO: known issue — see review §5.6 M15. Same as <input>: <select> falls
  // through the default branch. CLAUDE.md gotcha is silent about non-a/button
  // elements; this test locks the current behavior.
  it("applies role=link and tabindex=0 to <select> (default branch — incorrect a11y, locked as regression)", () => {
    const select = document.createElement("select");

    applyLinkA11y(select);

    expect(select.getAttribute("role")).toBe("link");
    expect(select.getAttribute("tabindex")).toBe("0");
  });
});

// Review §5.1 — modifier-key short-circuit on the shared helper. Click-event
// handlers are already covered by Link.test.ts / vLink.test.ts; these pin
// the helper-level behavior so the contract is independent of the host
// component implementation.
describe("shouldNavigate — modifier keys", () => {
  it("returns false when altKey is held (Chrome/Firefox download-link shortcut)", () => {
    const evt = new MouseEvent("click", { button: 0, altKey: true });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("returns false when shiftKey is held (new-window shortcut)", () => {
    const evt = new MouseEvent("click", { button: 0, shiftKey: true });

    expect(shouldNavigate(evt)).toBe(false);
  });

  // Review §5.4 — metaKey / ctrlKey are equally documented modifiers, both
  // map to "open in new tab" on macOS and Windows/Linux respectively. The
  // PBT in tests/property/shouldNavigate.properties.ts covers the full
  // truth table; these two hand-written cases keep the contract visible in
  // the per-modifier regression list alongside the older alt/shift ones.
  it("returns false when metaKey is held (macOS open-in-new-tab shortcut)", () => {
    const evt = new MouseEvent("click", { button: 0, metaKey: true });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("returns false when ctrlKey is held (Windows/Linux open-in-new-tab shortcut)", () => {
    const evt = new MouseEvent("click", { button: 0, ctrlKey: true });

    expect(shouldNavigate(evt)).toBe(false);
  });

  // Review §5.4 — non-left mouse buttons. Browsers fire `click` events for
  // middle/right buttons in some legacy paths; `shouldNavigate` must reject
  // them so the browser's native behavior (new tab / context menu) wins.
  it("returns false on middle-click (button=1) without modifiers", () => {
    const evt = new MouseEvent("click", { button: 1 });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("returns false on right-click (button=2) without modifiers", () => {
    const evt = new MouseEvent("click", { button: 2 });

    expect(shouldNavigate(evt)).toBe(false);
  });
});

// Review §5.6 — `applyLinkA11y` edge cases beyond <a>/<button> early-return.
describe("applyLinkA11y — attribute preservation and SVG handling", () => {
  it("preserves an existing tabindex attribute even if non-zero (-1)", () => {
    // `hasAttribute("tabindex")` returns true regardless of the value, so the
    // helper short-circuits without overwriting. Consumers may set
    // `tabindex="-1"` to mark a Link as intentionally not focusable
    // (e.g., a disabled menu item).
    const div = document.createElement("div");

    div.setAttribute("tabindex", "-1");
    applyLinkA11y(div);

    expect(div.getAttribute("tabindex")).toBe("-1");
    // role still applied — it was not set.
    expect(div.getAttribute("role")).toBe("link");
  });

  it("does NOT inspect aria-disabled — role and tabindex are still applied", () => {
    // `applyLinkA11y` has no aria-disabled branch — locks the current behavior
    // as a regression. Consumers who want a non-focusable disabled link must
    // pre-set tabindex="-1" themselves (the preservation test above).
    const div = document.createElement("div");

    div.setAttribute("aria-disabled", "true");
    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("0");
    expect(div.getAttribute("aria-disabled")).toBe("true");
  });

  it("applies role=link / tabindex=0 to an SVG element via `hasAttribute` (no early return)", () => {
    // `SVGElement` is not `HTMLAnchorElement | HTMLButtonElement` → falls
    // through to the default branch. `hasAttribute` works on SVG elements
    // identically. The semantic correctness of `role="link"` on SVG is
    // debatable but the helper's contract is "make non-a/button elements
    // keyboard-focusable" — this locks the current behavior.
    const svg = document.createElementNS(
      "https://www.w3.org/2000/svg",
      "g",
    ) as unknown as HTMLElement;

    applyLinkA11y(svg);

    expect(svg.getAttribute("role")).toBe("link");
    expect(svg.getAttribute("tabindex")).toBe("0");
  });
});

// Review §5.2 Bug 1 — `buildHref` return-value contract (post-fix). The
// previous behaviour used `url !== undefined` and propagated any non-undefined
// value (null, "", 0, false) as the href — silent self-navigation on `""` and
// stringified `"null"` / `"0"` / `"false"` from misbehaving plugins.
//
// New contract: `typeof url === "string" && url.length > 0` — any falsy /
// non-string return from `buildUrl` falls back to `router.buildPath`. The
// "intentional break" anticipated by the previous lock is now done; this
// block re-locks the corrected contract.
describe("buildHref — buildUrl non-string return (behaviour lock, post-fix §5.2 Bug 1)", () => {
  function makeRouterWithBuildUrl(returnValue: unknown): Router {
    const router = createRouter([{ name: "users", path: "/users" }]);

    void router.start("/users");
    (router as unknown as { buildUrl: () => unknown }).buildUrl = () =>
      returnValue;

    return router;
  }

  it("falls back to buildPath when buildUrl returns null (type-contract violation)", () => {
    const router = makeRouterWithBuildUrl(null);

    expect(buildHref(router, "users", {})).toBe("/users");

    router.stop();
  });

  it("falls back to buildPath when buildUrl returns the number 0", () => {
    const router = makeRouterWithBuildUrl(0);

    expect(buildHref(router, "users", {})).toBe("/users");

    router.stop();
  });

  it("falls back to buildPath when buildUrl returns the boolean false", () => {
    const router = makeRouterWithBuildUrl(false);

    expect(buildHref(router, "users", {})).toBe("/users");

    router.stop();
  });

  it("falls back to buildPath when buildUrl returns empty string '' (silent self-nav prevention)", () => {
    const router = makeRouterWithBuildUrl("");

    // The original bug: `<a href="">` resolves to the current page URL →
    // clicking the Link silently navigates to self. Fix delegates to buildPath.
    expect(buildHref(router, "users", {})).toBe("/users");

    router.stop();
  });

  it("falls back to buildPath when buildUrl returns undefined (unchanged from pre-fix)", () => {
    const router = makeRouterWithBuildUrl(undefined);

    expect(buildHref(router, "users", {})).toBe("/users");

    router.stop();
  });

  it("propagates a non-empty string verbatim (positive contract — only valid case)", () => {
    const router = makeRouterWithBuildUrl("/custom/users");

    expect(buildHref(router, "users", {})).toBe("/custom/users");

    router.stop();
  });
});

// Review §5.5 — functional regression companions for the documented quirks.
// PBT covers the general contract in the React property-test suite; these
// pin the Vue-adapter call shapes so a refactor of `shallowEqual` does not
// silently change behavior for Vue consumers.
describe("shallowEqual — edge cases not covered by PBT-only suite", () => {
  it("treats equal-length objects with *different* keys (both undefined) as NOT equal — hasOwnProperty guard", () => {
    // Documented behavior: `hasOwnProperty` guard exists specifically to keep
    // `{a: undefined}` distinct from `{b: undefined}`. Without the guard, the
    // missing key in `next` would read as `undefined` and falsely compare
    // equal. Lock the bug-or-feature noted in review §5.5.
    expect(shallowEqual({ a: undefined }, { b: undefined })).toBe(false);
  });

  it("returns false when prev is undefined and next is an object", () => {
    // Nullable short-circuit: Object.is(undefined, {}) is false → falls
    // through to the `!prev || !next` early-return path.
    expect(shallowEqual(undefined, {})).toBe(false);
  });

  it("returns false when prev is an object and next is undefined", () => {
    expect(shallowEqual({}, undefined)).toBe(false);
  });

  it("returns true for two same-shape empty objects (keys.length === 0 short-circuit)", () => {
    expect(shallowEqual({}, {})).toBe(true);
  });
});

// Review §5.4 — `buildActiveClassName` documented quirks. The dedupe Set is
// built from base tokens, so duplicate active tokens are absorbed but
// duplicate base tokens are preserved. Pin both directions as regressions.
describe("buildActiveClassName — documented quirks", () => {
  it("preserves duplicate `base` tokens (Set dedup applies to active-vs-base only, not to base internals)", () => {
    // Base = "  base  active  base  " — `parseTokens` splits to
    // ["base", "active", "base"]. The Set is seeded from baseTokens, so
    // the active token "active" is already present → not appended. The
    // duplicate "base" tokens remain in the array (order preserved).
    expect(buildActiveClassName(true, "active", "  base  active  base  ")).toBe(
      "base active base",
    );
  });

  it("dedupes repeated tokens in `activeClassName` via the Set", () => {
    // Active = "active active" — parseTokens yields ["active", "active"].
    // After base seed = ["foo"], the loop appends "active" once (Set guard
    // suppresses the second pass).
    expect(buildActiveClassName(true, "active active", "foo")).toBe(
      "foo active",
    );
  });

  it("returns base unchanged when activeClassName parses to zero tokens (empty string)", () => {
    // Early-return path: parseTokens("") → [] → returns baseClassName.
    expect(buildActiveClassName(true, "", "base")).toBe("base");
  });

  it("returns undefined when both active and base are undefined (early-return on falsy active)", () => {
    expect(buildActiveClassName(true, undefined, undefined)).toBeUndefined();
  });
});

// Review §5.2 — `buildUrl=undefined` fallback paths. When the router lacks a
// URL plugin (memory-plugin, console UIs), buildHref falls back to
// `router.buildPath` + manual hash concat. The hash is encoded via the
// inline RFC 3986 helper that mirrors `shared/browser-env/url-context.ts`.
describe("buildHref — hash fallback path (no URL plugin)", () => {
  function makeFallbackRouter(): Router {
    // No browser-plugin → router.buildUrl stays undefined → falls into the
    // `path + #encoded` branch of buildHref.
    const router = createRouter([
      { name: "settings", path: "/settings" },
      { name: "users.view", path: "/users/:id" },
    ]);

    void router.start("/settings");

    return router;
  }

  it("appends an encoded hash to buildPath() result when buildUrl is undefined", () => {
    const router = makeFallbackRouter();

    expect(buildHref(router, "settings", {}, undefined, "profile")).toBe(
      "/settings#profile",
    );

    router.stop();
  });

  it("returns the bare path (no trailing #) when hash is the empty string", () => {
    const router = makeFallbackRouter();

    // Empty hash → `normHash` is falsy, so the conditional `?` drops the `#`.
    expect(buildHref(router, "settings", {}, undefined, "")).toBe("/settings");

    router.stop();
  });

  it("percent-encodes `%`, space, and non-ASCII fragment chars via encodeURI; defensively escapes `#`", () => {
    const router = makeFallbackRouter();

    // encodeURI preserves sub-delims (`&`, `=`, `?`, `:`) but encodes:
    //   - `%` → `%25`
    //   - ` ` → `%20`
    //   - `用` (U+7528) → `%E7%94%A8`
    //   - `户` (U+6237) → `%E6%88%B7`
    // encodeURI does NOT escape `#`; the helper does that defensively, but
    // the input has no `#` here — we add another case below for that branch.
    const href = buildHref(
      router,
      "settings",
      {},
      undefined,
      "section%and 用户",
    );

    expect(href).toBe("/settings#section%25and%20%E7%94%A8%E6%88%B7");

    router.stop();
  });

  it("defensively escapes literal `#` characters in the fragment to %23", () => {
    const router = makeFallbackRouter();

    // After the leading-# strip, what remains may still contain inner `#`
    // characters. encodeURI does not escape `#`, but encodeFragmentInline
    // does — pin the defensive replaceAll.
    expect(buildHref(router, "settings", {}, undefined, "a#b")).toBe(
      "/settings#a%23b",
    );

    router.stop();
  });

  it("strips a leading `#` from the hash option (`'#section'` and `'section'` produce the same href)", () => {
    const router = makeFallbackRouter();

    const withHash = buildHref(router, "settings", {}, undefined, "#section");
    const withoutHash = buildHref(router, "settings", {}, undefined, "section");

    expect(withHash).toBe("/settings#section");
    expect(withHash).toBe(withoutHash);

    router.stop();
  });
});
