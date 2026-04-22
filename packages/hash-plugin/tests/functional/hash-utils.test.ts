// Direct unit tests for hash-utils.ts — the pure primitives consumed by
// factory.ts and the test helpers (createMockedBrowser, createStressRouter).
//
// These tests guard the *helper itself*; integration-level coverage in
// url.test.ts proves the helper is wired correctly into the factory path.
// Both layers are needed: dropping the unit tests would leave regressions
// in `buildHashLocation` visible only through tangled router flows.

import { describe, it, expect } from "vitest";

import {
  buildHashLocation,
  createHashPrefixRegex,
  extractHashPath,
  hashUrlToPath,
} from "../../src/hash-utils";

describe("hash-utils — buildHashLocation (#506)", () => {
  describe("core cases", () => {
    it("returns '/' for an empty hash, ignoring search", () => {
      expect(buildHashLocation("", "", null)).toBe("/");
      expect(buildHashLocation("", "?page=1", null)).toBe("/?page=1");
    });

    it("returns '/' for a bare '#', ignoring search", () => {
      expect(buildHashLocation("#", "", null)).toBe("/");
      expect(buildHashLocation("#", "?page=1", null)).toBe("/?page=1");
    });

    it("strips leading '#' and appends outer search for plain hash paths", () => {
      expect(buildHashLocation("#/users", "?page=1", null)).toBe(
        "/users?page=1",
      );
      expect(buildHashLocation("#/users/42", "", null)).toBe("/users/42");
    });

    it("strips the configured hashPrefix before encoding", () => {
      const prefixRegex = createHashPrefixRegex("!");

      expect(buildHashLocation("#!/users", "", prefixRegex)).toBe("/users");
      expect(buildHashLocation("#!/users", "?sort=asc", prefixRegex)).toBe(
        "/users?sort=asc",
      );
    });
  });

  describe("no-double-'?' contract", () => {
    // The regression that motivated extracting this helper: when the hash
    // itself already carries a query (e.g. `#/users?sort=asc`), the outer
    // `location.search` must NOT be appended — otherwise the resulting
    // path contains two `?` separators and query parsing breaks.

    it("does not append outer search when hash path already carries '?'", () => {
      expect(buildHashLocation("#/users?sort=asc", "?page=1", null)).toBe(
        "/users?sort=asc",
      );
    });

    it("does not append empty outer search when hash has a query either", () => {
      expect(buildHashLocation("#/users?sort=asc", "", null)).toBe(
        "/users?sort=asc",
      );
    });

    it("appends outer search when hash path has no '?'", () => {
      expect(buildHashLocation("#/users", "?sort=asc", null)).toBe(
        "/users?sort=asc",
      );
    });

    it("holds the contract with a hashPrefix", () => {
      const prefixRegex = createHashPrefixRegex("!");

      // Prefix stripped, inner ? wins, outer search discarded.
      expect(
        buildHashLocation("#!/users?sort=asc", "?page=1", prefixRegex),
      ).toBe("/users?sort=asc");
      // No inner ? → outer search appended.
      expect(buildHashLocation("#!/users", "?page=1", prefixRegex)).toBe(
        "/users?page=1",
      );
    });
  });

  describe("URL encoding", () => {
    it("percent-encodes non-ASCII characters in the hash path", () => {
      // Unicode in the path must survive safelyEncodePath.
      expect(buildHashLocation("#/пользователи", "", null)).toBe(
        "/%D0%BF%D0%BE%D0%BB%D1%8C%D0%B7%D0%BE%D0%B2%D0%B0%D1%82%D0%B5%D0%BB%D0%B8",
      );
    });

    it("passes already-percent-encoded sequences through unchanged", () => {
      expect(buildHashLocation("#/users%20list", "", null)).toBe(
        "/users%20list",
      );
    });

    it("leaves malformed percent sequences in place (safelyEncodePath catch)", () => {
      // safelyEncodePath swallows URIError and returns the input unchanged.
      expect(buildHashLocation("#/%E0%A4%A", "", null)).toBe("/%E0%A4%A");
    });
  });

  describe("composition with extractHashPath / hashUrlToPath", () => {
    // Smoke-check that `buildHashLocation` stays a thin composition layer
    // over `extractHashPath` + `safelyEncodePath` + outer-search merge.
    // If someone inlines a different path-extraction into the helper, these
    // agreements break.

    it("agrees with extractHashPath for the path portion when outer search is empty", () => {
      const hash = "#/items/42";
      const prefixRegex = null;
      const direct = extractHashPath(hash, prefixRegex);

      expect(buildHashLocation(hash, "", prefixRegex)).toBe(direct);
    });

    it("matches hashUrlToPath for absolute URLs with the same hash + search", () => {
      // hashUrlToPath(url) parses url.hash + url.search separately; our
      // helper receives them as positional arguments. Both should yield
      // identical strings given the same components.
      const url = "https://example.com/?page=1#/users?sort=asc";
      const prefixRegex = null;

      expect(hashUrlToPath(url, prefixRegex)).toBe(
        buildHashLocation("#/users?sort=asc", "?page=1", prefixRegex),
      );
    });
  });
});
