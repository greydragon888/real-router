import { afterEach, describe, expect, it } from "vitest";

import { applyLinkA11y } from "../../src/dom-utils";

/**
 * Unit coverage for `applyLinkA11y` edge cases. The function ships in
 * `shared/dom-utils` and is exercised by Vue / Svelte / Solid / Angular
 * directives, but `@real-router/react` re-exports it through the symlinked
 * `dom-utils` so coverage in this package keeps the React bundle's surface
 * fully tested.
 */
describe("applyLinkA11y", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is a no-op when element is null or undefined", () => {
    expect(() => {
      applyLinkA11y(null);
    }).not.toThrow();
    expect(() => {
      applyLinkA11y(undefined);
    }).not.toThrow();
  });

  it("does not modify <a> or <button> elements (native semantics already correct)", () => {
    const anchor = document.createElement("a");
    const button = document.createElement("button");

    applyLinkA11y(anchor);
    applyLinkA11y(button);

    expect(anchor.hasAttribute("role")).toBe(false);
    expect(anchor.hasAttribute("tabindex")).toBe(false);
    expect(button.hasAttribute("role")).toBe(false);
    expect(button.hasAttribute("tabindex")).toBe(false);
  });

  it("adds role='link' and tabindex='0' on plain elements", () => {
    const div = document.createElement("div");

    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("preserves existing role attribute (does not overwrite)", () => {
    const div = document.createElement("div");

    div.setAttribute("role", "button");
    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("button");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("preserves existing tabindex attribute (does not overwrite)", () => {
    const div = document.createElement("div");

    div.setAttribute("tabindex", "-1");
    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("-1");
  });

  it("preserves both role and tabindex when both are pre-set", () => {
    const div = document.createElement("div");

    div.setAttribute("role", "menuitem");
    div.setAttribute("tabindex", "5");
    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("menuitem");
    expect(div.getAttribute("tabindex")).toBe("5");
  });

  it("uses hasAttribute (not getAttribute) so empty role/tabindex strings are preserved", () => {
    const div = document.createElement("div");

    // Empty-string attributes are technically present — applyLinkA11y must not
    // overwrite them just because getAttribute would return falsy.
    div.setAttribute("role", "");
    div.setAttribute("tabindex", "");
    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("");
    expect(div.getAttribute("tabindex")).toBe("");
  });
});
