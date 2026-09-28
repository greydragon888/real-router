import { describe, expect, it } from "vitest";

import { isSameHref } from "../../src/href-utils";

// A non-special scheme keeps an empty pathname for an authority-only URL:
// `new URL("tauri://localhost").pathname === ""`. `isSameHref` reads it as "/"
// on both sides of the comparison (INVARIANTS K3d), and only there (K4).
describe("isSameHref — empty pathname under a non-special scheme", () => {
  it("treats an authority-only target as the root of the current entry", () => {
    expect(isSameHref("tauri://localhost", "tauri://localhost/")).toBe(true);
  });

  it("treats the root path as the document an authority-only entry shows", () => {
    expect(isSameHref("/", "tauri://localhost")).toBe(true);
  });

  it("matches an authority-only URL against itself", () => {
    expect(isSameHref("tauri://localhost", "tauri://localhost")).toBe(true);
  });

  it("keeps a non-root path distinct from an authority-only URL", () => {
    expect(isSameHref("tauri://localhost", "tauri://localhost/users")).toBe(
      false,
    );
    expect(isSameHref("/users", "tauri://localhost")).toBe(false);
  });
});
