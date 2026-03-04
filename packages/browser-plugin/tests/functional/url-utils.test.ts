import { describe, beforeEach, it, expect, vi } from "vitest";

import { urlToPath, buildUrl, createRegExpCache } from "../../src/url-utils";

import type { URLParseOptions, RegExpCache } from "../../src/types";

describe("url-utils", () => {
  describe("createRegExpCache", () => {
    it("returns compiled RegExp for a pattern", () => {
      const cache = createRegExpCache();
      const re = cache.get("^/app");

      expect(re).toBeInstanceOf(RegExp);
      expect(re.source).toBe(String.raw`^\/app`);
    });

    it("returns the same instance on subsequent calls", () => {
      const cache = createRegExpCache();
      const first = cache.get("^#!");
      const second = cache.get("^#!");

      expect(first).toBe(second);
    });

    it("returns different instances for different patterns", () => {
      const cache = createRegExpCache();
      const a = cache.get("^/app");
      const b = cache.get("^/api");

      expect(a).not.toBe(b);
    });
  });

  describe("buildUrl", () => {
    it("concatenates base + prefix + path", () => {
      expect(buildUrl("/users", "/app", "#!")).toBe("/app#!/users");
    });

    it("works with empty base and prefix", () => {
      expect(buildUrl("/users", "", "")).toBe("/users");
    });

    it("works with base only", () => {
      expect(buildUrl("/users", "/app", "")).toBe("/app/users");
    });

    it("works with hash prefix only", () => {
      expect(buildUrl("/users", "", "#!")).toBe("#!/users");
    });
  });

  describe("urlToPath", () => {
    let cache: RegExpCache;

    beforeEach(() => {
      cache = createRegExpCache();
    });

    describe("history mode", () => {
      const historyOptions: URLParseOptions = { useHash: false };

      it("extracts pathname from absolute URL", () => {
        const result = urlToPath(
          "http://localhost/users",
          historyOptions,
          cache,
        );

        expect(result).toBe("/users");
      });

      it("extracts pathname from relative URL", () => {
        const result = urlToPath("/users/123", historyOptions, cache);

        expect(result).toBe("/users/123");
      });

      it("preserves query string", () => {
        const result = urlToPath("/users?page=2", historyOptions, cache);

        expect(result).toBe("/users?page=2");
      });

      it("returns root path for empty path", () => {
        const result = urlToPath("/", historyOptions, cache);

        expect(result).toBe("/");
      });
    });

    describe("history mode with base", () => {
      const baseOptions: URLParseOptions = { useHash: false, base: "/app" };

      it("strips base from pathname", () => {
        const result = urlToPath("/app/users", baseOptions, cache);

        expect(result).toBe("/users");
      });

      it("returns root when only base is present", () => {
        const result = urlToPath("/app", baseOptions, cache);

        expect(result).toBe("/");
      });

      it("preserves query string after stripping base", () => {
        const result = urlToPath("/app/users?page=2", baseOptions, cache);

        expect(result).toBe("/users?page=2");
      });

      it("adds leading slash when stripped result has none", () => {
        const result = urlToPath(
          "/app",
          { useHash: false, base: "/app" },
          cache,
        );

        expect(result).toBe("/");
        expect(result!.startsWith("/")).toBe(true);
      });
    });

    describe("hash mode", () => {
      const hashOptions: URLParseOptions = { useHash: true };

      it("extracts path from hash", () => {
        const result = urlToPath(
          "http://localhost/#/users",
          hashOptions,
          cache,
        );

        expect(result).toBe("/users");
      });

      it("preserves query string in hash mode", () => {
        const result = urlToPath(
          "http://localhost/#/users?page=2",
          hashOptions,
          cache,
        );

        expect(result).toBe("/users?page=2");
      });
    });

    describe("hash mode with hashPrefix", () => {
      const prefixOptions: URLParseOptions = {
        useHash: true,
        hashPrefix: "!",
      };

      it("strips hash prefix from path", () => {
        const result = urlToPath(
          "http://localhost/#!/users",
          prefixOptions,
          cache,
        );

        expect(result).toBe("/users");
      });

      it("preserves query string with hash prefix", () => {
        const result = urlToPath(
          "http://localhost/#!/users?page=2",
          prefixOptions,
          cache,
        );

        expect(result).toBe("/users?page=2");
      });
    });

    describe("hash prefix with regex special characters", () => {
      it("handles dot as hash prefix", () => {
        const options: URLParseOptions = { useHash: true, hashPrefix: "." };
        const result = urlToPath("http://localhost/#./users", options, cache);

        expect(result).toBe("/users");
      });
    });

    describe("error handling", () => {
      it("returns null for invalid protocol", () => {
        const consoleSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {});

        const result = urlToPath(
          "ftp://example.com/file",
          { useHash: false },
          cache,
        );

        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Invalid URL protocol"),
        );

        consoleSpy.mockRestore();
      });

      it("returns null on URL parse error", () => {
        const consoleSpy = vi
          .spyOn(console, "warn")
          .mockImplementation(() => {});

        const originalURL = globalThis.URL;

        globalThis.URL = function () {
          throw new Error("parse error");
        } as unknown as typeof URL;

        const result = urlToPath(
          "http://localhost/test",
          { useHash: false },
          cache,
        );

        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Could not parse url"),
          expect.any(Error),
        );

        globalThis.URL = originalURL;
        consoleSpy.mockRestore();
      });
    });
  });
});
