import { createRouter } from "@real-router/core";
import { describe, it, expect, vi } from "vitest";

import {
  applyLinkA11y,
  buildActiveClassName,
  buildHref,
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

    router.start("/users").catch(() => {});

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
      expect.stringContaining(`Route "users.view"`),
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
});
