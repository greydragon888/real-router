import { createRouter } from "@real-router/core";
import { describe, it, expect, vi } from "vitest";

import {
  shouldNavigate,
  buildHref,
  navigateWithHash,
  buildActiveClassName,
  shallowEqual,
  applyLinkA11y,
} from "../../../src/dom-utils";

import type { Params, Router, State } from "@real-router/core";

describe("shouldNavigate", () => {
  it("1 — returns true for left click with no modifiers", () => {
    const evt = new MouseEvent("click", { button: 0, bubbles: true });

    expect(shouldNavigate(evt)).toBe(true);
  });

  it("2 — returns false when metaKey is pressed", () => {
    const evt = new MouseEvent("click", {
      button: 0,
      metaKey: true,
      bubbles: true,
    });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("3 — returns false when altKey is pressed", () => {
    const evt = new MouseEvent("click", {
      button: 0,
      altKey: true,
      bubbles: true,
    });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("4 — returns false when ctrlKey is pressed", () => {
    const evt = new MouseEvent("click", {
      button: 0,
      ctrlKey: true,
      bubbles: true,
    });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("5 — returns false when shiftKey is pressed", () => {
    const evt = new MouseEvent("click", {
      button: 0,
      shiftKey: true,
      bubbles: true,
    });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("6 — returns false for middle click (button === 1)", () => {
    const evt = new MouseEvent("click", { button: 1, bubbles: true });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("7 — returns false for right click (button === 2)", () => {
    const evt = new MouseEvent("click", { button: 2, bubbles: true });

    expect(shouldNavigate(evt)).toBe(false);
  });

  it("8 — returns true even when event.defaultPrevented is true (caller responsibility)", () => {
    // shouldNavigate only checks button + modifier keys, not defaultPrevented.
    // Framework adapters (Link components) check defaultPrevented separately.
    const div = document.createElement("div");

    div.addEventListener("click", (event) => {
      event.preventDefault();
    });

    const evt = new MouseEvent("click", {
      button: 0,
      bubbles: true,
      cancelable: true,
    });

    div.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(true);
    expect(shouldNavigate(evt)).toBe(true);
  });
});

describe("buildHref", () => {
  it("1 — uses buildUrl when available", () => {
    const router = {
      buildUrl: vi.fn().mockReturnValue("/url/123"),
      buildPath: vi.fn().mockReturnValue("/path/123"),
    } as unknown as Router;

    const result = buildHref(router, "users.profile", { id: "123" });

    expect(result).toBe("/url/123");
    expect(router.buildUrl).toHaveBeenCalledWith(
      "users.profile",
      { id: "123" },
      undefined,
      undefined,
    );
    expect(router.buildPath).not.toHaveBeenCalled();
  });

  it("2 — falls back to buildPath when buildUrl is not a function", () => {
    const router = {
      buildPath: vi.fn().mockReturnValue("/path/123"),
    } as unknown as Router;

    const result = buildHref(router, "users.profile", { id: "123" });

    expect(result).toBe("/path/123");
    expect(router.buildPath).toHaveBeenCalledWith(
      "users.profile",
      { id: "123" },
      undefined,
    );
  });

  it("3 — passes empty params to buildUrl", () => {
    const router = {
      buildUrl: vi.fn().mockReturnValue("/home"),
      buildPath: vi.fn(),
    } as unknown as Router;

    buildHref(router, "home", {});

    expect(router.buildUrl).toHaveBeenCalledWith(
      "home",
      {},
      undefined,
      undefined,
    );
  });

  it("4 — passes empty params to buildPath fallback", () => {
    const router = {
      buildPath: vi.fn().mockReturnValue("/home"),
    } as unknown as Router;

    buildHref(router, "home", {});

    expect(router.buildPath).toHaveBeenCalledWith("home", {}, undefined);
  });

  it("5 — returns undefined and logs error when buildPath throws for unknown route", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const router = {
      buildPath: vi.fn().mockImplementation(() => {
        throw new Error(
          "[SegmentMatcher.buildPath] 'nonexistent' is not defined",
        );
      }),
    } as unknown as Router;

    const result = buildHref(router, "nonexistent", {});

    expect(result).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("nonexistent"),
    );

    consoleError.mockRestore();
  });

  it("6 — returns undefined and logs error when buildUrl throws for unknown route", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const router = {
      buildUrl: vi.fn().mockImplementation(() => {
        throw new Error("Route not found");
      }),
      buildPath: vi.fn(),
    } as unknown as Router;

    const result = buildHref(router, "nonexistent", {});

    expect(result).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("nonexistent"),
    );
    expect(router.buildPath).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("7 — preserves hash fragment returned by buildUrl", () => {
    const router = {
      buildUrl: vi.fn().mockReturnValue("/docs#section-a"),
      buildPath: vi.fn(),
    } as unknown as Router;

    expect(buildHref(router, "docs", {})).toBe("/docs#section-a");
  });

  it("8 — preserves query params returned by buildUrl", () => {
    const router = {
      buildUrl: vi.fn().mockReturnValue("/users?sort=asc&page=2"),
      buildPath: vi.fn(),
    } as unknown as Router;

    expect(buildHref(router, "users", {})).toBe("/users?sort=asc&page=2");
  });

  it("9 — does NOT strip trailing slash or normalize paths", () => {
    // buildHref is a pass-through — it returns whatever buildUrl/buildPath
    // produced. Trailing-slash policy is owned by the core router's options.
    const router = {
      buildPath: vi.fn().mockReturnValue("/users/"),
    } as unknown as Router;

    expect(buildHref(router, "users", {})).toBe("/users/");
  });

  it("10 — forwards numeric params to buildUrl verbatim", () => {
    const router = {
      buildUrl: vi.fn().mockReturnValue("/items/42"),
      buildPath: vi.fn(),
    } as unknown as Router;

    buildHref(router, "items.item", { id: 42 });

    expect(router.buildUrl).toHaveBeenCalledWith(
      "items.item",
      { id: 42 },
      undefined,
      undefined,
    );
  });

  it("11 — forwards Unicode params to buildUrl verbatim", () => {
    const router = {
      buildUrl: vi.fn().mockReturnValue("/users/%D0%B8%D0%B2%D0%B0%D0%BD"),
      buildPath: vi.fn(),
    } as unknown as Router;

    buildHref(router, "users.view", { id: "иван" });

    expect(router.buildUrl).toHaveBeenCalledWith(
      "users.view",
      { id: "иван" },
      undefined,
      undefined,
    );
  });

  it("12 — returns undefined + logs error when buildPath returns empty string (#P0.1 audit)", () => {
    // Symmetric to the buildUrl="" defense (Invariant 12 in property tests).
    // A custom path-matcher that returns "" for a registered route would
    // otherwise render `<a href="">` → silent self-navigation on click.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const router = {
      buildPath: vi.fn().mockReturnValue(""),
    } as unknown as Router;

    const result = buildHref(router, "weird-route", {});

    expect(result).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("weird-route"),
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("empty path"),
    );

    consoleError.mockRestore();
  });

  it("13 — returns undefined + logs error when buildUrl returns '' AND buildPath returns '' (#P0.1 audit)", () => {
    // Both layers degrade to empty — must not concatenate `${""}#${hash}`
    // into a bare `<a href="#hash">`. Treat as no-href.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const router = {
      buildUrl: vi.fn().mockReturnValue(""),
      buildPath: vi.fn().mockReturnValue(""),
    } as unknown as Router;

    const result = buildHref(router, "weird-route", {}, undefined, "tab");

    expect(result).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("weird-route"),
    );

    consoleError.mockRestore();
  });
});

describe("buildActiveClassName", () => {
  it("1 — returns activeClassName alone when active and no base class", () => {
    expect(buildActiveClassName(true, "active", undefined)).toBe("active");
  });

  it("2 — concatenates base class and activeClassName when active and both provided", () => {
    expect(buildActiveClassName(true, "active", "nav-link")).toBe(
      "nav-link active",
    );
  });

  it("3 — returns base class when not active", () => {
    expect(buildActiveClassName(false, "active", "nav-link")).toBe("nav-link");
  });

  it("4 — returns undefined when not active and no base class", () => {
    expect(buildActiveClassName(false, "active", undefined)).toBeUndefined();
  });

  it("5 — returns base class when active but no activeClassName provided", () => {
    expect(buildActiveClassName(true, undefined, "nav-link")).toBe("nav-link");
  });

  it("6 — returns undefined when not active and no classes at all", () => {
    expect(buildActiveClassName(false, undefined, undefined)).toBeUndefined();
  });

  it("7 — returns base class when active but activeClassName is empty string", () => {
    expect(buildActiveClassName(true, "", "nav-link")).toBe("nav-link");
  });

  it("8 — whitespace-only activeClassName is trimmed away when concatenated", () => {
    // " " is truthy in JS, so the branch enters; .trim() removes trailing whitespace
    expect(buildActiveClassName(true, " ", "nav-link")).toBe("nav-link");
  });

  it("9 — whitespace-only baseClassName is preserved when not active", () => {
    expect(buildActiveClassName(false, "active", " ")).toBe(" ");
  });

  it("10 — deduplicates tokens when active class is already present in base", () => {
    // If the author pre-applied "active" to the base class, the token should
    // not be duplicated after activation.
    expect(buildActiveClassName(true, "active", "nav-link active")).toBe(
      "nav-link active",
    );
  });

  it("11 — merges multi-token activeClassName with base and preserves order", () => {
    expect(buildActiveClassName(true, "active highlighted", "nav-link")).toBe(
      "nav-link active highlighted",
    );
  });

  it("12 — collapses duplicate tokens within the base class", () => {
    // parseTokens splits on any whitespace — tabs, multiple spaces, newlines.
    expect(buildActiveClassName(true, "active", "nav-link\tactive")).toBe(
      "nav-link active",
    );
  });
});

describe("applyLinkA11y", () => {
  it("1 — sets role='link' and tabindex='0' on a generic element (div)", () => {
    const div = document.createElement("div");

    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("2 — skips anchor elements — does not set role or tabindex", () => {
    const a = document.createElement("a");

    applyLinkA11y(a);

    expect(a.getAttribute("role")).toBeNull();
    expect(a.getAttribute("tabindex")).toBeNull();
  });

  it("3 — skips button elements — does not set role or tabindex", () => {
    const button = document.createElement("button");

    applyLinkA11y(button);

    expect(button.getAttribute("role")).toBeNull();
    expect(button.getAttribute("tabindex")).toBeNull();
  });

  it("4 — preserves existing role when one is already set", () => {
    const div = document.createElement("div");

    div.setAttribute("role", "navigation");

    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("navigation");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("5 — preserves existing tabindex when one is already set", () => {
    const div = document.createElement("div");

    div.setAttribute("tabindex", "-1");

    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("-1");
  });

  it("6 — sets role and tabindex on a span element", () => {
    const span = document.createElement("span");

    applyLinkA11y(span);

    expect(span.getAttribute("role")).toBe("link");
    expect(span.getAttribute("tabindex")).toBe("0");
  });

  it("7 — sets role and tabindex on a contenteditable element", () => {
    const div = document.createElement("div");

    div.setAttribute("contenteditable", "true");

    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("8 — no-op on null element (defensive guard for non-TS consumers)", () => {
    expect(() => {
      applyLinkA11y(null);
    }).not.toThrow();
  });

  it("9 — no-op on undefined element (defensive guard for non-TS consumers)", () => {
    expect(() => {
      applyLinkA11y(undefined);
    }).not.toThrow();
  });

  // audit-2026-05-17 §5 HIGH #4 (Sprint A.1) — cross-realm safety. The
  // helper now compares `tagName` rather than `instanceof`, so an
  // anchor-like element from a foreign realm (iframe contentDocument,
  // micro-frontend) is correctly skipped even though its prototype
  // chain does NOT lead to *this* realm's `HTMLAnchorElement`.
  // Simulate by handing the helper an object whose `tagName === "A"`
  // but is NOT a real HTMLAnchorElement subclass.
  it("10 — cross-realm: foreign anchor (tagName='A', not instanceof HTMLAnchorElement) is skipped", () => {
    const setAttribute = vi.fn();
    const hasAttribute = vi.fn().mockReturnValue(false);
    const foreignAnchor = {
      tagName: "A",
      setAttribute,
      hasAttribute,
    } as unknown as HTMLElement;

    applyLinkA11y(foreignAnchor);

    // Must NOT have set role/tabindex — recognised as an anchor by
    // tagName despite failing the instanceof check.
    expect(setAttribute).not.toHaveBeenCalled();
  });

  it("11 — cross-realm: foreign button (tagName='BUTTON', not instanceof HTMLButtonElement) is skipped", () => {
    const setAttribute = vi.fn();
    const hasAttribute = vi.fn().mockReturnValue(false);
    const foreignButton = {
      tagName: "BUTTON",
      setAttribute,
      hasAttribute,
    } as unknown as HTMLElement;

    applyLinkA11y(foreignButton);

    expect(setAttribute).not.toHaveBeenCalled();
  });

  it("12 — case-sensitivity: lowercase 'a' (SVG anchor namespace) is NOT skipped", () => {
    // SVG `<a>` has lowercase tagName because it's in the SVG
    // namespace. Solid/React do not produce SVG anchors via <Link>,
    // but if a consumer manually passes one to applyLinkA11y, it
    // gets a11y treatment — SVG anchors don't have native keyboard
    // activation. Locks the uppercase-only contract.
    const setAttribute = vi.fn();
    const hasAttribute = vi.fn().mockReturnValue(false);
    const svgAnchor = {
      tagName: "a",
      setAttribute,
      hasAttribute,
    } as unknown as HTMLElement;

    applyLinkA11y(svgAnchor);

    expect(setAttribute).toHaveBeenCalledWith("role", "link");
    expect(setAttribute).toHaveBeenCalledWith("tabindex", "0");
  });
});

describe("buildHref — fragment encoding (encodeFragmentInline)", () => {
  const routerWith = (path: string): Router =>
    ({ buildPath: vi.fn().mockReturnValue(path) }) as unknown as Router;

  it("encodes an already-percent-encoded hash as a LITERAL fragment — strict, no roundtrip (#1211)", () => {
    // D1=A: `<Link hash>` is a DECODED fragment. "%E2%9C%93" is the literal
    // 9-character string, not an escape to decode — so each `%` is encoded
    // (`%` → `%25`). Before #1211 the probe-roundtrip decoded it to ✓ and
    // re-encoded to "%E2%9C%93" (the copy-from-location.hash tolerance, E.1,
    // now removed so the adapter matches the strict plugin layer).
    const href = buildHref(routerWith("/p"), "r", {}, undefined, "%E2%9C%93");

    expect(href).toBe("/p#%25E2%259C%2593");
  });

  it("encodes a literal '%' verbatim — a malformed-looking percent triple is just text (#1211)", () => {
    // "%C3%28" is a literal fragment; the strict encoder has no probe/catch —
    // it always plain-encodes, so each `%` → `%25`. (Coincides with the old
    // decode-throws → catch → plain-encode fallthrough, but is now the ONLY path.)
    const href = buildHref(routerWith("/p"), "r", {}, undefined, "%C3%28");

    expect(href).toBe("/p#%25C3%2528");
  });

  it("fragment encoder is the canonical encodeURI+#→%23 — sync with browser-env encodeHashFragment (#1211)", () => {
    // encodeFragmentInline is BYTE-duplicated from browser-env's
    // encodeHashFragment (the dom-utils symlink graph can't reach browser-env).
    // Both must be the trivial `encodeURI(x).replaceAll("#", "%23")`. This locks
    // the adapter copy to that formula so it can't silently drift back to a
    // probe-roundtrip (which would re-open the plugin↔adapter split, #1211 / E.1).
    const canonical = (s: string): string =>
      encodeURI(s).replaceAll("#", "%23");

    for (const input of [
      "a b",
      "%20",
      "%E2%9C%93",
      "a#b",
      "café",
      "x=1&y=2",
      "100%",
    ]) {
      const href = buildHref(routerWith("/p"), "r", {}, undefined, input);

      expect(href).toBe(`/p#${canonical(input)}`);
    }
  });

  it("encodes a plain (non-percent) hash directly", () => {
    const href = buildHref(routerWith("/p"), "r", {}, undefined, "a b");

    expect(href).toBe("/p#a%20b");
  });

  it("strips a single leading '#' before encoding", () => {
    const href = buildHref(routerWith("/p"), "r", {}, undefined, "#frag");

    expect(href).toBe("/p#frag");
  });
});

describe("navigateWithHash", () => {
  // `isActiveRoute` joined the contract the helper depends on (#1555): the
  // "same location?" question moved to the router, which is the only thing that
  // knows the channel rule and the provenance-tolerant comparison. These states
  // are hand-written, so their values share the caller's provenance and a shallow
  // comparison answers exactly what the real predicate answers — which keeps
  // these cases about what they were always about, the hash delta and the opts
  // it assembles. The provenance divergence itself is covered against a REAL
  // router further down.
  const makeRouter = (state: State | undefined): Router =>
    ({
      getState: vi.fn().mockReturnValue(state),
      navigate: vi.fn().mockResolvedValue({}),
      isActiveRoute: vi.fn(
        (name: string, params: Params) =>
          state?.name === name && shallowEqual(state.params, params),
      ),
    }) as unknown as Router;

  it("adds force + hashChange when the same route+params gets a new hash", async () => {
    const router = makeRouter({
      name: "r",
      params: { id: "1" },
      context: { url: { hash: "old" } },
    } as unknown as State);

    await navigateWithHash(router, "r", { id: "1" }, undefined, "new");

    expect(router.navigate).toHaveBeenCalledWith("r", { id: "1" }, undefined, {
      hash: "new",
      force: true,
      hashChange: true,
    });
  });

  it("does not force when the hash is unchanged on the same route+params", async () => {
    const router = makeRouter({
      name: "r",
      params: { id: "1" },
      context: { url: { hash: "same" } },
    } as unknown as State);

    await navigateWithHash(router, "r", { id: "1" }, undefined, "same");

    expect(router.navigate).toHaveBeenCalledWith("r", { id: "1" }, undefined, {
      hash: "same",
    });
  });

  it("does a plain navigate for a different route (no same-route branch)", async () => {
    const router = makeRouter({
      name: "other",
      params: {},
      context: { url: { hash: "x" } },
    } as unknown as State);

    await navigateWithHash(router, "r", {}, undefined, "h");

    expect(router.navigate).toHaveBeenCalledWith("r", {}, undefined, {
      hash: "h",
    });
  });

  it("omits the hash option entirely when hash is undefined", async () => {
    const router = makeRouter(undefined);

    await navigateWithHash(router, "r", {}, undefined, undefined);

    expect(router.navigate).toHaveBeenCalledWith("r", {}, undefined, {});
  });

  it("treats a missing context.url.hash as empty (same route, new hash forces)", async () => {
    // context has no url.hash → currentHash falls back to "" (the `?? ""`).
    const router = makeRouter({
      name: "r",
      params: {},
      context: {},
    } as unknown as State);

    await navigateWithHash(router, "r", {}, undefined, "frag");

    expect(router.navigate).toHaveBeenCalledWith("r", {}, undefined, {
      hash: "frag",
      force: true,
      hashChange: true,
    });
  });

  it("keeps the current hash when called with hash=undefined on the same route", async () => {
    // newHash = hash ?? currentHash → currentHash, so it equals current: no force.
    const router = makeRouter({
      name: "r",
      params: {},
      context: { url: { hash: "keep" } },
    } as unknown as State);

    await navigateWithHash(router, "r", {}, undefined, undefined);

    expect(router.navigate).toHaveBeenCalledWith("r", {}, undefined, {});
  });
});

// #1555 — the same-route hash bypass against a REAL router.
//
// The mock-based cases above cannot express this defect: their `getState()`
// returns a hand-written state whose query values are the same literals the
// caller passes, so any comparison — tolerant or strict — says "equal". The
// divergence only exists when the two sides have different PROVENANCE: the URL
// direction parses `?page=2` into the number `2`, while a `<Link routeSearch>`
// prop carries whatever the consumer wrote, normally the string `"2"`.
describe("navigateWithHash — same-route bypass against a real router (#1555)", () => {
  const makeRealRouter = async () => {
    const router = createRouter([
      { name: "x", path: "/x?page" },
      { name: "y", path: "/y" },
    ]);

    // Committed from a URL, so `state.search.page` is the PARSED number 2.
    await router.start("/x?page=2");

    return router;
  };

  it("fires when the link writes the query as a string and the state parsed it", async () => {
    const router = await makeRealRouter();
    const spy = vi.spyOn(router, "navigate");

    await navigateWithHash(router, "x", {}, { page: "2" }, "section2").catch(
      () => undefined,
    );

    expect(spy).toHaveBeenCalledWith(
      "x",
      {},
      { page: "2" },
      expect.objectContaining({ force: true, hashChange: true }),
    );

    router.dispose();
  });

  it("fires when the link omits routeSearch entirely (query unchanged)", async () => {
    const router = await makeRealRouter();
    const spy = vi.spyOn(router, "navigate");

    await navigateWithHash(router, "x", {}, undefined, "section2").catch(
      () => undefined,
    );

    // The committed query, not `undefined` (#1925). The name already said
    // "query unchanged"; the assertion used to pin the value that changes it.
    expect(spy).toHaveBeenCalledWith(
      "x",
      {},
      { page: 2 },
      expect.objectContaining({ force: true, hashChange: true }),
    );
    expect(router.getState()?.path).toBe("/x?page=2");

    router.dispose();
  });

  // Discrimination: the bypass must NOT fire for a different location, or
  // `force: true` would smuggle a real navigation through as a hash change.
  it("does not fire when the query value actually differs", async () => {
    const router = await makeRealRouter();
    const spy = vi.spyOn(router, "navigate");

    await navigateWithHash(router, "x", {}, { page: "3" }, "section2").catch(
      () => undefined,
    );

    expect(spy).toHaveBeenCalledWith(
      "x",
      {},
      { page: "3" },
      { hash: "section2" },
    );

    router.dispose();
  });

  it("does not fire for a different route", async () => {
    const router = await makeRealRouter();
    const spy = vi.spyOn(router, "navigate");

    await navigateWithHash(router, "y", {}, undefined, "section2").catch(
      () => undefined,
    );

    expect(spy).toHaveBeenCalledWith("y", {}, undefined, { hash: "section2" });

    router.dispose();
  });
});

describe("navigateWithHash — a key declared in neither channel (#1978)", () => {
  // A key the route declares in NEITHER channel stays in `state.params` as
  // app-level data (#1579) and never reaches `state.path`. The bypass asks
  // `router.isActiveRoute(name, params, search, true, false)`, and that call
  // used to let such a key decide — so `<Link hash>` was dead on the route.
  const makeRealRouter = async () => {
    const router = createRouter([
      { name: "u", path: "/u/:id" },
      { name: "y", path: "/y" },
    ]);

    // Start elsewhere: navigating to `/u/7` FROM `/u/7` is `SAME_STATES` —
    // the default polarity already ignores the undeclared key, which is the
    // very asymmetry this suite is about.
    await router.start("/y");
    // `tab` is declared nowhere, so it rides in `state.params` while
    // `state.path` stays `/u/7`.
    await router.navigate("u", { id: "7", tab: "settings" });

    return router;
  };

  it("still arms the same-route bypass", async () => {
    const router = await makeRealRouter();

    expect(router.getState()?.path).toBe("/u/7");

    const spy = vi.spyOn(router, "navigate");

    await navigateWithHash(
      router,
      "u",
      { id: "7" },
      undefined,
      "install",
    ).catch(() => undefined);

    // `current.search` rather than `undefined` since #1925 — an ARGUMENT-shape
    // change, not a behavioural one: this state carries no query, so the value
    // is core's own `EMPTY_SEARCH` singleton and the committed path is the same
    // `/u/7` either way (asserted below).
    expect(spy).toHaveBeenCalledWith(
      "u",
      { id: "7" },
      {},
      expect.objectContaining({ force: true, hashChange: true }),
    );
    expect(router.getState()?.path).toBe("/u/7");

    router.dispose();
  });

  // Discrimination: the bypass must still refuse a genuinely different
  // location, or `force: true` smuggles a real navigation through as a hash
  // change — the rule the call's own comment states.
  it("does not fire when a declared path param actually differs", async () => {
    const router = await makeRealRouter();
    const spy = vi.spyOn(router, "navigate");

    await navigateWithHash(
      router,
      "u",
      { id: "8" },
      undefined,
      "install",
    ).catch(() => undefined);

    expect(spy).toHaveBeenCalledWith("u", { id: "8" }, undefined, {
      hash: "install",
    });

    router.dispose();
  });
});

describe("navigateWithHash — the bypass must not change the location (#1925)", () => {
  const makeRouter = async (startPath: string) => {
    const router = createRouter([
      { name: "docs", path: "/docs?tab" },
      { name: "other", path: "/other" },
    ]);

    await router.start(startPath);

    return router;
  };

  // The bypass fires when the helper has decided this link points at the
  // location the user is already on and only the fragment differs. It then
  // announces `hashChange: true` — so the navigation it wraps must not move the
  // location it just called unchanged.
  it("keeps the current query when the bypass arms", async () => {
    const router = await makeRouter("/docs?tab=api");
    const spy = vi.spyOn(router, "navigate");

    await navigateWithHash(router, "docs", {}, undefined, "install").catch(
      () => undefined,
    );

    expect(spy).toHaveBeenCalledWith(
      "docs",
      {},
      { tab: "api" },
      expect.objectContaining({ force: true, hashChange: true }),
    );
    expect(router.getState()?.path).toBe("/docs?tab=api");

    router.dispose();
  });

  // CONTROL — a link that names a DIFFERENT query is a different location, so
  // the bypass does not arm and the query it names is the one that navigates.
  it("still follows a link that names a different query", async () => {
    const router = await makeRouter("/docs?tab=api");
    const spy = vi.spyOn(router, "navigate");

    await navigateWithHash(
      router,
      "docs",
      {},
      { tab: "other" },
      "install",
    ).catch(() => undefined);

    expect(spy).toHaveBeenCalledWith(
      "docs",
      {},
      { tab: "other" },
      {
        hash: "install",
      },
    );
    expect(router.getState()?.path).toBe("/docs?tab=other");

    router.dispose();
  });

  // CONTROL — the escape hatch. An explicit empty `routeSearch` still clears
  // the query under the bypass, because `{}` is not nullish and the
  // substitution is a `??`. A caller who means "same route, new fragment, drop
  // the query" can still say so.
  it("an explicit empty routeSearch still clears the query", async () => {
    const router = await makeRouter("/docs?tab=api");
    const spy = vi.spyOn(router, "navigate");

    await navigateWithHash(router, "docs", {}, {}, "install").catch(
      () => undefined,
    );

    expect(spy).toHaveBeenCalledWith("docs", {}, {}, { hash: "install" });
    expect(router.getState()?.path).toBe("/docs");

    router.dispose();
  });

  // CONTROL — without a hash there is no bypass and no claim of sameness: the
  // link means the location it names, and `<Link routeName="docs">` names
  // `/docs`. The substitution is deliberately NOT applied here.
  it("does not substitute when the bypass does not arm", async () => {
    const router = await makeRouter("/docs?tab=api");
    const spy = vi.spyOn(router, "navigate");

    await navigateWithHash(router, "docs", {}, undefined, undefined).catch(
      () => undefined,
    );

    expect(spy).toHaveBeenCalledWith("docs", {}, undefined, {});
    expect(router.getState()?.path).toBe("/docs");

    router.dispose();
  });
});

describe("shallowEqual", () => {
  it("true for an identical reference (Object.is short-circuit)", () => {
    const obj = { a: 1 };

    expect(shallowEqual(obj, obj)).toBe(true);
  });

  it("false when either side is null/undefined", () => {
    expect(shallowEqual({ a: 1 }, undefined)).toBe(false);
    expect(shallowEqual(undefined, { a: 1 })).toBe(false);
  });

  it("false on a key-count mismatch", () => {
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("false when a key is absent in the other record (hasOwnProperty guard)", () => {
    // Same key count, both values `undefined`, but different keys — the
    // hasOwnProperty guard prevents a false match.
    expect(shallowEqual({ a: undefined }, { b: undefined })).toBe(false);
  });

  it("false on a per-key value mismatch", () => {
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("true for shallow-equal records", () => {
    expect(shallowEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
  });

  // #2064 — the count and the membership test have to ask the SAME question.
  // `Object.keys` is own AND enumerable; `hasOwnProperty` is own only, and on a
  // Proxy it is whatever the trap says. They disagree on exactly the keys the
  // count refuses to see, and two disjoint bags then compare EQUAL — a skipped
  // re-render, with the memoised `<Link>` keeping the previous href and active
  // class.
  const conceal = (
    visible: Record<string, unknown>,
    concealed: Record<string, unknown>,
  ): Record<string, unknown> => {
    const bag = { ...visible };

    for (const [key, value] of Object.entries(concealed)) {
      Object.defineProperty(bag, key, { value, enumerable: false });
    }

    return bag;
  };

  it("false when the other side CONCEALS its matching key (own, not enumerable)", () => {
    // `{ b: "2" }` is all `Object.keys` sees, so the counts agree at one — and
    // the membership test is then asked about a key the count refused.
    const concealed = conceal({ b: "2" }, { a: "1" });

    expect(shallowEqual({ a: "1" }, concealed)).toBe(false);
    // Both directions: #627 closed this one already, and it must stay closed.
    expect(shallowEqual(concealed, { a: "1" })).toBe(false);
  });

  it("false when a Proxy VOUCHES for a key its ownKeys never listed", () => {
    // Not a hypothetical bag: `shared/dom-utils/CLAUDE.md` records Svelte 5's
    // `$props()` reporting own-ness for a key only its prototype has, on every
    // `RouteView` render — nobody writes the Proxy, the framework does (#1853).
    const lying = new Proxy(
      Object.assign(Object.create({ a: "1" }), { b: "2" }),
      {
        getOwnPropertyDescriptor: (target, key) =>
          key === "a"
            ? { value: "1", enumerable: true, configurable: true }
            : Reflect.getOwnPropertyDescriptor(target, key),
      },
    );

    expect(shallowEqual({ a: "1" }, lying)).toBe(false);
  });

  it("CONTROL — the same shapes without the concealment answer as they always did", () => {
    // Without this the two cells above are satisfied by a comparator that
    // answers `false` to everything.
    expect(shallowEqual({ a: "1" }, conceal({ a: "1" }, {}))).toBe(true);
    expect(shallowEqual({ a: "1" }, { a: "1" })).toBe(true);
    expect(shallowEqual({ a: "1" }, { b: "2" })).toBe(false);
    // An INHERITED key is already refused — the half #627 closed, and the
    // adjacency that makes the hole above read as covered.
    expect(
      shallowEqual(
        { a: "1" },
        Object.assign(Object.create({ a: "1" }), { b: "2" }),
      ),
    ).toBe(false);
  });
});

describe("buildActiveClassName — whitespace-only active class", () => {
  it("treats a whitespace-only active class as no tokens, returning the base", () => {
    // parseTokens("   ") → match(/\S+/g) === null → [] → activeTokens.length === 0.
    expect(buildActiveClassName(true, " ".repeat(3), "base")).toBe("base");
  });

  it("returns undefined when active class is whitespace-only and no base", () => {
    expect(
      buildActiveClassName(true, " ".repeat(3), undefined),
    ).toBeUndefined();
  });
});
