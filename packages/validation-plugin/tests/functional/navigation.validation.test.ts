import { errorCodes } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createValidationRouter } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("navigation validation — with validationPlugin", () => {
  beforeEach(async () => {
    router = createValidationRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("navigate() options validation", () => {
    it("should throw TypeError for invalid options type (string)", () => {
      const raw = router as unknown as {
        navigate: (n: string, p: object, o: unknown) => unknown;
      };

      expect(() => raw.navigate("users", {}, "invalid")).toThrow(TypeError);
      expect(() => raw.navigate("users", {}, "invalid")).toThrow(
        /Invalid options/,
      );
    });

    it("should throw TypeError for invalid options type (number)", () => {
      const raw = router as unknown as {
        navigate: (n: string, p: object, o: unknown) => unknown;
      };

      expect(() => raw.navigate("users", {}, 123)).toThrow(TypeError);
    });

    it("should throw TypeError for invalid options type (array)", () => {
      const raw = router as unknown as {
        navigate: (n: string, p: object, o: unknown) => unknown;
      };

      expect(() => raw.navigate("users", {}, [])).toThrow(TypeError);
    });

    it("should throw TypeError for invalid option field types", () => {
      const raw = router as unknown as {
        navigate: (n: string, p: object, o: unknown) => unknown;
      };

      expect(() => raw.navigate("users", {}, { replace: "true" })).toThrow(
        TypeError,
      );
      expect(() => raw.navigate("users", {}, { reload: 1 })).toThrow(TypeError);
    });

    it("should accept valid NavigationOptions", () => {
      expect(() => {
        void router.navigate("users", {}, { replace: true, reload: false });
      }).not.toThrow();
    });

    it("should accept empty options object", () => {
      expect(() => {
        void router.navigate("users", {}, {});
      }).not.toThrow();
    });

    it("should accept undefined options", () => {
      expect(() => {
        void router.navigate("users", {});
      }).not.toThrow();
    });

    it("should include method name in error message", () => {
      const raw = router as unknown as {
        navigate: (n: string, p: object, o: unknown) => unknown;
      };
      const action = () => raw.navigate("users", {}, { replace: "invalid" });

      expect(action).toThrow(TypeError);
      expect(action).toThrow(/\[router\.navigate\]/);
    });
  });

  describe("navigate() route name validation", () => {
    it("should throw TypeError for number as route name", () => {
      const raw = router as unknown as { navigate: (n: unknown) => unknown };

      expect(() => raw.navigate(123)).toThrow(TypeError);
      expect(router.isActive()).toBe(true);
    });

    it("should throw TypeError for null as route name", () => {
      const raw = router as unknown as { navigate: (n: unknown) => unknown };

      expect(() => raw.navigate(null)).toThrow(TypeError);
      expect(router.isActive()).toBe(true);
    });

    it("should throw TypeError for undefined as route name", () => {
      const raw = router as unknown as { navigate: (n: unknown) => unknown };

      expect(() => raw.navigate(undefined)).toThrow(TypeError);
      expect(router.isActive()).toBe(true);
    });

    it("should not throw for empty string (returns ROUTE_NOT_FOUND)", async () => {
      await expect(router.navigate("")).rejects.toMatchObject({
        code: errorCodes.ROUTE_NOT_FOUND,
      });

      expect(router.isActive()).toBe(true);
    });
  });

  describe("navigateToDefault() options validation", () => {
    it("should throw TypeError for invalid argument types", () => {
      const raw = router as unknown as {
        navigateToDefault: (o: unknown) => Promise<unknown>;
      };

      expect(() => raw.navigateToDefault("string")).toThrow(TypeError);
    });

    it("should throw TypeError for invalid options type (string)", () => {
      const raw = router as unknown as {
        navigateToDefault: (o: unknown) => Promise<unknown>;
      };

      expect(() => raw.navigateToDefault("invalid")).toThrow(/Invalid options/);
    });

    it("should throw TypeError for invalid options type (number)", () => {
      const raw = router as unknown as {
        navigateToDefault: (o: unknown) => Promise<unknown>;
      };

      expect(() => raw.navigateToDefault(123)).toThrow(TypeError);
    });

    it("should throw TypeError for invalid option field types", () => {
      const raw = router as unknown as {
        navigateToDefault: (o: unknown) => Promise<unknown>;
      };

      expect(() => raw.navigateToDefault({ replace: "true" })).toThrow(
        TypeError,
      );
    });

    it("should include method name in error message", () => {
      const raw = router as unknown as {
        navigateToDefault: (o: unknown) => Promise<unknown>;
      };

      expect(() => raw.navigateToDefault("invalid")).toThrow(
        /navigateToDefault/,
      );
    });
  });

  describe("navigateToState() state shape validation", () => {
    it("should throw TypeError when state is null", () => {
      expect(() =>
        (
          getPluginApi(router) as unknown as {
            navigateToState: (s: unknown) => Promise<unknown>;
          }
        ).navigateToState(null),
      ).toThrow(/\[router\.navigateToState\] Invalid state/);
    });

    it("should throw TypeError when state is a string", () => {
      const api = getPluginApi(router) as unknown as {
        navigateToState: (s: unknown) => Promise<unknown>;
      };

      expect(() => api.navigateToState("foo")).toThrow(
        /Invalid state.*Expected State object/,
      );
    });

    it("should throw TypeError when state.name is not a string", () => {
      const api = getPluginApi(router) as unknown as {
        navigateToState: (s: unknown) => Promise<unknown>;
      };

      expect(() =>
        api.navigateToState({ name: 42, params: {}, path: "/" }),
      ).toThrow(/Invalid state\.name/);
    });

    it("should throw TypeError when state.params is not a plain object", () => {
      const api = getPluginApi(router) as unknown as {
        navigateToState: (s: unknown) => Promise<unknown>;
      };

      expect(() =>
        api.navigateToState({ name: "users", params: "qux", path: "/users" }),
      ).toThrow(/Invalid state\.params/);
    });

    it("should throw TypeError when state.path is not a string", () => {
      const api = getPluginApi(router) as unknown as {
        navigateToState: (s: unknown) => Promise<unknown>;
      };

      expect(() =>
        api.navigateToState({ name: "users", params: {}, path: 9 }),
      ).toThrow(/Invalid state\.path/);
    });

    it("should accept a structurally valid state and not throw", async () => {
      const api = getPluginApi(router);
      const matched = api.matchPath("/users");

      expect(matched).toBeDefined();
      await expect(api.navigateToState(matched!)).resolves.toBeDefined();
    });

    it("should validate options when provided", async () => {
      const api = getPluginApi(router);
      const matched = api.matchPath("/users");

      expect(matched).toBeDefined();
      // Pass invalid options shape — must trigger validateNavigationOptions
      // throw before any pipeline work happens.
      expect(() =>
        (
          api as unknown as {
            navigateToState: (s: unknown, o: unknown) => Promise<unknown>;
          }
        ).navigateToState(matched!, "not-an-options-object"),
      ).toThrow(/Invalid options/);
    });

    it("should accept valid options", async () => {
      const api = getPluginApi(router);
      const matched = api.matchPath("/users");

      expect(matched).toBeDefined();
      await expect(
        api.navigateToState(matched!, { replace: true }),
      ).resolves.toBeDefined();
    });
  });
});

describe("validateParams — navigate() params validation", () => {
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
      navigate: (name: string, params: unknown) => Promise<unknown>;
    };

    expect(() => raw.navigate("home", "string-params")).toThrow(TypeError);
  });

  it("throws TypeError when params is a number", () => {
    const raw = router as unknown as {
      navigate: (name: string, params: unknown) => Promise<unknown>;
    };

    expect(() => raw.navigate("home", 42)).toThrow(TypeError);
  });

  it("throws TypeError when params is an array", () => {
    const raw = router as unknown as {
      navigate: (name: string, params: unknown) => Promise<unknown>;
    };

    expect(() => raw.navigate("home", [])).toThrow(TypeError);
  });

  it("throws TypeError when params is a class instance", () => {
    class Foo {
      readonly x = 1;
    }
    const raw = router as unknown as {
      navigate: (name: string, params: unknown) => Promise<unknown>;
    };

    expect(() => raw.navigate("home", new Foo())).toThrow(TypeError);
  });

  it("includes method name in error message", () => {
    const raw = router as unknown as {
      navigate: (name: string, params: unknown) => Promise<unknown>;
    };

    expect(() => raw.navigate("home", "bad")).toThrow(/\[router\.navigate\]/);
  });

  it("includes 'params must be a plain object' in error message", () => {
    const raw = router as unknown as {
      navigate: (name: string, params: unknown) => Promise<unknown>;
    };

    expect(() => raw.navigate("home", "bad")).toThrow(
      /params must be a plain object/,
    );
  });

  it("accepts undefined params", () => {
    expect(() => {
      void router.navigate("home");
    }).not.toThrow();
  });

  it("accepts plain object params", () => {
    expect(() => {
      void router.navigate("home", {});
    }).not.toThrow();
  });

  it("accepts params with string values", () => {
    expect(() => {
      void router.navigate("items", { id: "42" });
    }).not.toThrow();
  });
});

describe("validateParams — canNavigateTo() params validation", () => {
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
      canNavigateTo: (name: string, params: unknown) => boolean;
    };

    expect(() => raw.canNavigateTo("home", "not-object")).toThrow(TypeError);
  });

  it("throws TypeError when params is a number", () => {
    const raw = router as unknown as {
      canNavigateTo: (name: string, params: unknown) => boolean;
    };

    expect(() => raw.canNavigateTo("home", 5)).toThrow(TypeError);
  });

  it("includes 'canNavigateTo' in error message", () => {
    const raw = router as unknown as {
      canNavigateTo: (name: string, params: unknown) => boolean;
    };

    expect(() => raw.canNavigateTo("home", "bad")).toThrow(
      /\[router\.canNavigateTo\]/,
    );
  });

  it("accepts undefined params", () => {
    expect(() => router.canNavigateTo("home")).not.toThrow();
  });

  it("accepts plain object params", () => {
    expect(() => router.canNavigateTo("home", {})).not.toThrow();
  });
});
