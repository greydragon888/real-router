import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createValidationRouter } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("router methods validation — with validationPlugin", () => {
  beforeEach(async () => {
    router = createValidationRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("buildPath validation", () => {
    it("should throw TypeError when route is undefined", () => {
      const raw = router as unknown as { buildPath: (r: unknown) => string };

      expect(() => raw.buildPath(undefined)).toThrow(TypeError);
    });

    it("should throw TypeError when route is null", () => {
      const raw = router as unknown as { buildPath: (r: unknown) => string };

      expect(() => raw.buildPath(null)).toThrow(TypeError);
    });

    it("should throw TypeError when route is not a string", () => {
      const raw = router as unknown as { buildPath: (r: unknown) => string };

      expect(() => raw.buildPath(123)).toThrow(TypeError);
      expect(() => raw.buildPath({})).toThrow(TypeError);
    });

    it("should reject Cyrillic route names (ASCII only)", () => {
      const raw = router as unknown as { buildPath: (r: unknown) => string };

      expect(() => raw.buildPath("путь")).toThrow();
    });

    it("should reject emoji route names", () => {
      const raw = router as unknown as { buildPath: (r: unknown) => string };

      expect(() => raw.buildPath("🏠")).toThrow();
    });

    it("should reject route names with unicode characters", () => {
      const raw = router as unknown as { buildPath: (r: unknown) => string };

      expect(() => raw.buildPath("ñame")).toThrow();
    });

    it("should accept valid route name", () => {
      expect(() => router.buildPath("home")).not.toThrow();
    });
  });

  describe("isActiveRoute validation", () => {
    it("should throw on invalid params structure", () => {
      const raw = router as unknown as {
        isActiveRoute: (n: string, p: unknown) => boolean;
      };

      expect(() => raw.isActiveRoute("home", "not-object")).toThrow();
    });

    // ⚑ INVERTED, not deleted (#2134). This door judges the path bag by SHAPE
    // and no longer walks its values, so the two cells below record the answer
    // it gives instead of the throw it used to raise — a retired behaviour that
    // is not pinned comes back silently.
    //
    // ⚠ The answer is `true`, and the CONTROL beside it is why that is not a
    // weaker verdict: `home` declares no params, so an undeclared key is ignored
    // whatever its value — a plain `{ junk: "x" }` has always answered `true`
    // here, on bare core and with this plugin alike. What the value walk refused
    // was a bag whose extra key this door never looks at.
    //
    // ⚠ And the diagnostic is not lost, it moves to the door that USES the bag:
    // the same object still throws from `canNavigateTo`, which an adapter's
    // `<Link>` calls on the same render as this predicate.
    it("ignores an undeclared key whatever its value — no value walk here", () => {
      const raw = router as unknown as {
        isActiveRoute: (n: string, p: unknown) => boolean;
        canNavigateTo: (n: string, p: unknown) => boolean;
      };
      const junk = { fn: () => undefined };

      expect(raw.isActiveRoute("home", junk)).toBe(true);
      // CONTROL — a valid bag with the same undeclared key answers the same, so
      // the cell above records "undeclared is ignored", not "functions pass".
      expect(raw.isActiveRoute("home", { junk: "x" })).toBe(true);
      // …and the bag is still refused where it would actually be read.
      expect(() => raw.canNavigateTo("home", junk)).toThrow(
        /params must be a plain object/,
      );
    });

    it("ignores a circular undeclared key, and does not hang doing it", () => {
      const circular: Record<string, unknown> = {};

      circular.self = circular;

      const raw = router as unknown as {
        isActiveRoute: (n: string, p: unknown) => boolean;
        canNavigateTo: (n: string, p: unknown) => boolean;
      };

      expect(raw.isActiveRoute("home", circular)).toBe(true);
      expect(() => raw.canNavigateTo("home", circular)).toThrow(
        /params must be a plain object/,
      );
    });

    it("should throw when params contain class instance", () => {
      class Foo {
        readonly name = "foo";
      }
      const raw = router as unknown as {
        isActiveRoute: (n: string, p: unknown) => boolean;
      };

      expect(() => raw.isActiveRoute("home", new Foo())).toThrow();
    });

    it("should throw on non-boolean strictEquality", () => {
      const raw = router as unknown as {
        isActiveRoute: (
          n: string,
          p: unknown,
          s: unknown,
          strict: unknown,
        ) => boolean;
      };

      expect(() =>
        raw.isActiveRoute("home", {}, undefined, "not-boolean"),
      ).toThrow();
    });

    it("should throw on non-boolean ignoreQueryParams", () => {
      const raw = router as unknown as {
        isActiveRoute: (
          n: string,
          p: unknown,
          s?: unknown,
          strict?: unknown,
          iqp?: unknown,
        ) => boolean;
      };

      expect(() =>
        raw.isActiveRoute("home", {}, undefined, undefined, "not-boolean"),
      ).toThrow();
    });

    it("should reject Object.create() params with custom prototype", () => {
      const protoParams = Object.create({ custom: true });
      const raw = router as unknown as {
        isActiveRoute: (n: string, p: unknown) => boolean;
      };

      expect(() => raw.isActiveRoute("home", protoParams)).toThrow();
    });

    it("should accept valid params", () => {
      expect(() => router.isActiveRoute("home", {})).not.toThrow();
    });
  });

  describe("matchPath validation", () => {
    it("should throw TypeError for null path", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as { matchPath: (p: unknown) => unknown };

      expect(() => raw.matchPath(null)).toThrow(TypeError);
    });

    it("should throw TypeError for undefined path", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as { matchPath: (p: unknown) => unknown };

      expect(() => raw.matchPath(undefined)).toThrow(TypeError);
    });

    it("should throw TypeError for number path", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as { matchPath: (p: unknown) => unknown };

      expect(() => raw.matchPath(123)).toThrow(TypeError);
    });

    it("should throw TypeError for object path", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as { matchPath: (p: unknown) => unknown };

      expect(() => raw.matchPath({})).toThrow(TypeError);
    });

    it("should accept valid string path", () => {
      const api = getPluginApi(router);

      expect(() => api.matchPath("/home")).not.toThrow();
    });
  });

  describe("shouldUpdateNode validation", () => {
    it("should throw TypeError when nodeName is not a string (number)", () => {
      const raw = router as unknown as {
        shouldUpdateNode: (n: unknown) => boolean;
      };

      expect(() => raw.shouldUpdateNode(123)).toThrow(TypeError);
    });

    it("should throw TypeError when nodeName is null", () => {
      const raw = router as unknown as {
        shouldUpdateNode: (n: unknown) => boolean;
      };

      expect(() => raw.shouldUpdateNode(null)).toThrow(TypeError);
    });

    it("should throw TypeError when nodeName is undefined", () => {
      const raw = router as unknown as {
        shouldUpdateNode: (n: unknown) => boolean;
      };

      expect(() => raw.shouldUpdateNode(undefined)).toThrow(TypeError);
    });

    it("should throw TypeError when nodeName is an object", () => {
      const raw = router as unknown as {
        shouldUpdateNode: (n: unknown) => boolean;
      };

      expect(() => raw.shouldUpdateNode({})).toThrow(TypeError);
    });

    it("should throw TypeError when nodeName is an array", () => {
      const raw = router as unknown as {
        shouldUpdateNode: (n: unknown) => boolean;
      };

      expect(() => raw.shouldUpdateNode(["home"])).toThrow(TypeError);
    });

    it("should accept valid string nodeName", () => {
      expect(() => router.shouldUpdateNode("")).not.toThrow();
    });
  });

  describe("canNavigateTo validation", () => {
    it("should throw TypeError for non-string route name", () => {
      const raw = router as unknown as {
        canNavigateTo: (n: unknown) => boolean;
      };

      expect(() => raw.canNavigateTo(123)).toThrow(TypeError);
    });

    it("should throw TypeError for whitespace-only route name", () => {
      const raw = router as unknown as {
        canNavigateTo: (n: unknown) => boolean;
      };

      expect(() => raw.canNavigateTo(" ".repeat(3))).toThrow(TypeError);
    });

    it("should accept valid route name", () => {
      expect(() => router.canNavigateTo("home")).not.toThrow();
    });
  });
});

describe("validateParams — buildPath() params validation", () => {
  let router: Router;

  beforeEach(async () => {
    router = createValidationRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("throws TypeError when params is a string", () => {
    const raw = router as unknown as {
      buildPath: (route: string, params: unknown) => string;
    };

    expect(() => raw.buildPath("home", "not-object")).toThrow(TypeError);
  });

  it("throws TypeError when params is a number", () => {
    const raw = router as unknown as {
      buildPath: (route: string, params: unknown) => string;
    };

    expect(() => raw.buildPath("home", 99)).toThrow(TypeError);
  });

  it("throws TypeError when params is an array", () => {
    const raw = router as unknown as {
      buildPath: (route: string, params: unknown) => string;
    };

    expect(() => raw.buildPath("home", ["a", "b"])).toThrow(TypeError);
  });

  it("includes 'buildPath' in error message", () => {
    const raw = router as unknown as {
      buildPath: (route: string, params: unknown) => string;
    };

    expect(() => raw.buildPath("home", "bad")).toThrow(/\[router\.buildPath\]/);
  });

  it("accepts undefined params", () => {
    expect(() => router.buildPath("home")).not.toThrow();
  });

  it("accepts plain object params", () => {
    expect(() => router.buildPath("home", {})).not.toThrow();
  });
});

describe("validateStartArgs — start() path validation", () => {
  let router: Router;

  beforeEach(() => {
    router = createValidationRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("allows undefined path (browser-plugin injects via interceptor)", () => {
    const raw = router as unknown as {
      start: (path: unknown) => Promise<unknown>;
    };

    expect(() => raw.start(undefined)).not.toThrow(TypeError);
  });

  it("throws TypeError when path is a number", () => {
    const raw = router as unknown as {
      start: (path: unknown) => Promise<unknown>;
    };

    expect(() => raw.start(42)).toThrow(TypeError);
  });

  it("throws TypeError when path is an object", () => {
    const raw = router as unknown as {
      start: (path: unknown) => Promise<unknown>;
    };

    expect(() => raw.start({})).toThrow(TypeError);
  });

  it("includes 'path must be a string' in message for non-string", () => {
    const raw = router as unknown as {
      start: (path: unknown) => Promise<unknown>;
    };

    expect(() => raw.start(123)).toThrow(/path must be a string/);
  });

  it("throws TypeError when path does not start with '/'", () => {
    const raw = router as unknown as {
      start: (path: unknown) => Promise<unknown>;
    };

    expect(() => raw.start("home")).toThrow(TypeError);
  });

  it("includes the invalid path value in error message", () => {
    const raw = router as unknown as {
      start: (path: unknown) => Promise<unknown>;
    };

    expect(() => raw.start("home")).toThrow(/"home"/);
  });

  it("includes 'path must start with' in error message for missing slash", () => {
    const raw = router as unknown as {
      start: (path: unknown) => Promise<unknown>;
    };

    expect(() => raw.start("home")).toThrow(/must start with "\/"/);
  });

  it("accepts valid path starting with '/'", async () => {
    await expect(router.start("/home")).resolves.toBeDefined();
  });

  // #942: a NUL byte / control char in the start path is silently accepted by
  // core (percent-encoded into state.path) — the opt-in validator rejects it
  // with an actionable error instead.
  it("throws TypeError when the path contains a control character (#942)", () => {
    const raw = router as unknown as {
      start: (path: unknown) => Promise<unknown>;
    };

    expect(() => raw.start(`/items/${String.fromCodePoint(0)}`)).toThrow(
      /control character/,
    );
    expect(() => raw.start(`/items/a${String.fromCodePoint(1)}b`)).toThrow(
      TypeError,
    );
  });

  it("accepts empty string path", async () => {
    await expect(router.start("")).resolves.toBeDefined();
  });
});
