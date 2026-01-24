import { logger } from "@real-router/logger";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createRouter } from "@real-router/core";

import { getConfig } from "../../../../src/internals";
import { createTestRouter } from "../../../helpers";

import type { Params, Router } from "@real-router/core";

let router: Router;

describe("core/routes/routeQuery/isActiveRoute", () => {
  beforeEach(() => {
    router = createTestRouter();
    router.start();
  });

  afterEach(() => {
    router.stop();
  });

  describe("isActiveRoute", () => {
    it("should return true for current active route", () => {
      expect(router.isActiveRoute("home")).toBe(true);
    });

    it("should return false for non-active route", () => {
      expect(router.isActiveRoute("sign-in")).toBe(false);
    });

    it("should respect strictEquality", () => {
      router.navigate("sign-in");

      expect(router.isActiveRoute("home", {}, true)).toBe(false);
    });

    it("should return false if router was not started", () => {
      router.stop();

      expect(router.isActiveRoute("test", {})).toBe(false);
    });

    it("should return false if router was started and default state was not defined", () => {
      router.stop();

      router = createRouter().start();

      expect(router.isActiveRoute("test", {})).toBe(false);
    });

    it("should throw on invalid params structure", () => {
      expect(() => {
        router.isActiveRoute("home", "invalid-params" as unknown as Params);
      }).toThrowError("[router.isActiveRoute] Invalid params structure");
    });

    it("should throw when params contain a function", () => {
      expect(() => {
        router.isActiveRoute("home", { fn: () => {} } as unknown as Params);
      }).toThrowError("[router.isActiveRoute] Invalid params structure");
    });

    it("should throw when params contain circular reference", () => {
      const circular: Record<string, unknown> = { id: "123" };

      circular.self = circular;

      expect(() => {
        router.isActiveRoute("home", circular as unknown as Params);
      }).toThrowError("[router.isActiveRoute] Invalid params structure");
    });

    it("should throw when params contain class instance", () => {
      expect(() => {
        router.isActiveRoute("home", { date: new Date() } as unknown as Params);
      }).toThrowError("[router.isActiveRoute] Invalid params structure");
    });

    it("should throw on invalid route name", () => {
      expect(() => {
        router.isActiveRoute(null as unknown as string);
      }).toThrowError("Route name must be a string");
    });

    describe("hierarchy (strictEquality=false)", () => {
      it("should return true for parent route when child is active", () => {
        router.navigate("users.view", { id: "123" });

        expect(router.isActiveRoute("users")).toBe(true);
      });

      it("should return false for parent with strictEquality=true when child is active", () => {
        router.navigate("users.view", { id: "123" });

        expect(router.isActiveRoute("users", {}, true)).toBe(false);
      });

      it("should return false for sibling route when another sibling is active", () => {
        router.navigate("users.list");

        // users.view requires id param, but we're checking if it's active
        expect(router.isActiveRoute("users.view", { id: "123" })).toBe(false);
      });

      it("should return true when parent params match child params", () => {
        router.navigate("users.view", { id: "123" });

        // Parent route check with matching param
        expect(router.isActiveRoute("users", { id: "123" })).toBe(true);
      });

      it("should return false when parent params do not match child params", () => {
        router.navigate("users.view", { id: "123" });

        // Parent route check with different param
        expect(router.isActiveRoute("users", { id: "456" })).toBe(false);
      });

      it("should return true for multiple levels of hierarchy", () => {
        // Using existing nested routes from testRouters
        router.navigate("section.view", { section: "section1", id: "123" });

        // All ancestors should be considered active
        expect(router.isActiveRoute("section", { section: "section1" })).toBe(
          true,
        );
        expect(
          router.isActiveRoute("section.view", {
            section: "section1",
            id: "123",
          }),
        ).toBe(true);
      });
    });

    describe("ignoreQueryParams", () => {
      it("should ignore query params by default (ignoreQueryParams=true)", () => {
        router.navigate("section.query", {
          section: "section1",
          param1: "value1",
          param2: "value2",
          param3: "value3",
        });

        // Check with only URL param, ignoring query params
        expect(
          router.isActiveRoute("section.query", { section: "section1" }),
        ).toBe(true);
      });

      it("should consider query params when ignoreQueryParams=false", () => {
        router.navigate("section.query", {
          section: "section1",
          param1: "value1",
          param2: "value2",
          param3: "value3",
        });

        // With ignoreQueryParams=false, all params must match
        expect(
          router.isActiveRoute(
            "section.query",
            { section: "section1" },
            false,
            false,
          ),
        ).toBe(false);

        // All params match
        expect(
          router.isActiveRoute(
            "section.query",
            {
              section: "section1",
              param1: "value1",
              param2: "value2",
              param3: "value3",
            },
            false,
            false,
          ),
        ).toBe(true);
      });

      it("should return false when query params differ and ignoreQueryParams=false", () => {
        router.navigate("section.query", {
          section: "section1",
          param1: "value1",
          param2: "value2",
          param3: "value3",
        });

        // Different query param value
        expect(
          router.isActiveRoute(
            "section.query",
            {
              section: "section1",
              param1: "different",
              param2: "value2",
              param3: "value3",
            },
            false,
            false,
          ),
        ).toBe(false);
      });
    });

    describe("defaultParams in exact match", () => {
      it("should work without defaultParams (false branch coverage)", () => {
        // home has no defaultParams configured
        expect(getConfig(router).defaultParams.home).toBeUndefined();
        expect(router.isActiveRoute("home")).toBe(true);
      });

      it("should merge defaultParams with provided params", () => {
        // withDefaultParam has defaultParams: { param: "hello" }
        router.navigate("withDefaultParam");

        // Should merge defaultParams with empty params
        expect(router.isActiveRoute("withDefaultParam")).toBe(true);
        expect(router.isActiveRoute("withDefaultParam", {})).toBe(true);

        // With strictEquality, should still work
        expect(router.isActiveRoute("withDefaultParam", {}, true)).toBe(true);
      });
    });

    describe("defaultParams in hierarchical check", () => {
      it("should use defaultParams when checking parent route", () => {
        // Set defaultParams for parent route
        getConfig(router).defaultParams.users = { filter: "active" };

        // Navigate to child route with matching params
        router.navigate("users.view", { id: "123", filter: "active" });

        // Parent with matching defaultParams should be active
        expect(router.isActiveRoute("users")).toBe(true);
      });

      it("should return false when defaultParams do not match active state", () => {
        // Set defaultParams for parent route
        getConfig(router).defaultParams.users = { filter: "active" };

        // Navigate to child route with different params
        router.navigate("users.view", { id: "123", filter: "inactive" });

        // Parent with non-matching defaultParams should not be active
        expect(router.isActiveRoute("users")).toBe(false);
      });

      it("should prefer provided params over defaultParams", () => {
        // Set defaultParams for parent route
        getConfig(router).defaultParams.users = { filter: "active" };

        // Navigate to child route with different filter
        router.navigate("users.view", { id: "123", filter: "inactive" });

        // Providing explicit params should override defaultParams
        expect(router.isActiveRoute("users", { filter: "inactive" })).toBe(
          true,
        );
        expect(router.isActiveRoute("users", { filter: "active" })).toBe(false);
      });
    });

    describe("edge cases: param value types", () => {
      it("should not match when param value is undefined (undefined !== string)", () => {
        router.navigate("users.view", { id: "123" });

        // undefined in params means "id must be undefined", not "skip this check"
        expect(
          router.isActiveRoute("users.view", { id: undefined } as unknown as {
            id: string;
          }),
        ).toBe(false);
      });

      it("should not match when param is omitted for exact match (areStatesEqual compares URL params)", () => {
        router.navigate("users.view", { id: "123" });

        // For exact match (same name), areStatesEqual is used
        // With ignoreQueryParams=true, only URL params are compared
        // "id" is a URL param, so {} !== { id: "123" }
        expect(router.isActiveRoute("users.view", {})).toBe(false);

        // But parent route check works with empty params (hierarchical check)
        expect(router.isActiveRoute("users", {})).toBe(true);
      });

      it("should use strict equality for param comparison (number !== string)", () => {
        router.navigate("users.view", { id: "123" });

        // 123 !== "123" with strict equality
        expect(
          router.isActiveRoute("users.view", { id: 123 } as unknown as {
            id: string;
          }),
        ).toBe(false);
      });

      it("should not match null against string param", () => {
        router.navigate("users.view", { id: "123" });

        // null !== "123"
        expect(
          router.isActiveRoute("users.view", { id: null } as unknown as {
            id: string;
          }),
        ).toBe(false);
      });

      it("should handle undefined in hierarchical check (parent route)", () => {
        router.navigate("users.view", { id: "123" });

        // Hierarchical check uses paramsMatch
        // { id: undefined } means "id must be undefined in activeState"
        // activeState.params.id === "123", so undefined !== "123" → false
        expect(
          router.isActiveRoute("users", { id: undefined } as unknown as {
            id: string;
          }),
        ).toBe(false);

        // But checking with matching value works
        expect(router.isActiveRoute("users", { id: "123" })).toBe(true);
      });
    });

    describe("root node and boolean validation", () => {
      it("should handle root node empty string and warn", () => {
        const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

        // Root node ("") is not considered a parent of any named route
        expect(router.isActiveRoute("")).toBe(false);

        // Should warn about empty string usage
        expect(warnSpy).toHaveBeenCalledWith(
          "real-router",
          expect.stringContaining('isActiveRoute("") called with empty string'),
        );

        warnSpy.mockClear();

        router.navigate("users.view", { id: "123" });

        expect(router.isActiveRoute("")).toBe(false);
        expect(warnSpy).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
      });

      it("should throw on non-boolean strictEquality", () => {
        router.navigate("users.view", { id: "123" });

        // Truthy non-boolean values throw TypeError
        expect(() => {
          router.isActiveRoute("users", {}, 1 as unknown as boolean);
        }).toThrowError(
          "[router.isActiveRoute] strictEquality must be a boolean, got number",
        );

        expect(() => {
          router.isActiveRoute("users", {}, "true" as unknown as boolean);
        }).toThrowError(
          "[router.isActiveRoute] strictEquality must be a boolean, got string",
        );

        // IMPORTANT: "false" string would be truthy in JS - validation prevents this bug
        expect(() => {
          router.isActiveRoute("users", {}, "false" as unknown as boolean);
        }).toThrowError(
          "[router.isActiveRoute] strictEquality must be a boolean, got string",
        );

        // Falsy non-boolean values also throw TypeError
        expect(() => {
          router.isActiveRoute("users", {}, 0 as unknown as boolean);
        }).toThrowError(
          "[router.isActiveRoute] strictEquality must be a boolean, got number",
        );

        expect(() => {
          router.isActiveRoute("users", {}, "" as unknown as boolean);
        }).toThrowError(
          "[router.isActiveRoute] strictEquality must be a boolean, got string",
        );

        expect(() => {
          router.isActiveRoute("users", {}, null as unknown as boolean);
        }).toThrowError(
          "[router.isActiveRoute] strictEquality must be a boolean, got object",
        );
      });

      it("should throw on non-boolean ignoreQueryParams", () => {
        router.navigate("users.view", { id: "123" });

        expect(() => {
          router.isActiveRoute("users", {}, false, 1 as unknown as boolean);
        }).toThrowError(
          "[router.isActiveRoute] ignoreQueryParams must be a boolean, got number",
        );

        expect(() => {
          router.isActiveRoute(
            "users",
            {},
            false,
            "true" as unknown as boolean,
          );
        }).toThrowError(
          "[router.isActiveRoute] ignoreQueryParams must be a boolean, got string",
        );

        expect(() => {
          router.isActiveRoute("users", {}, false, null as unknown as boolean);
        }).toThrowError(
          "[router.isActiveRoute] ignoreQueryParams must be a boolean, got object",
        );
      });

      it("should accept valid boolean values", () => {
        router.navigate("users.view", { id: "123" });

        // Explicit boolean values work correctly
        expect(router.isActiveRoute("users", {}, false)).toBe(true); // hierarchical
        expect(router.isActiveRoute("users", {}, true)).toBe(false); // strict

        expect(
          router.isActiveRoute("users.view", { id: "123" }, false, true),
        ).toBe(true);
        expect(
          router.isActiveRoute("users.view", { id: "123" }, false, false),
        ).toBe(true);
      });
    });

    describe("inherited properties", () => {
      it("should reject Object.create() params with custom prototype", () => {
        router.navigate("users.view", { id: "123" });

        // Create object with inherited property via Object.create()
        const proto = { id: "123" };
        const params = Object.create(proto) as { id: string };

        // Objects with custom prototype are rejected by validateParams
        // (isSerializable checks Object.getPrototypeOf(value) === Object.prototype)
        expect(() => {
          router.isActiveRoute("users.view", params);
        }).toThrowError("[router.isActiveRoute] Invalid params structure");
      });

      it("should reject Object.create() params even with own properties", () => {
        router.navigate("users.view", { id: "123" });

        // Own property shadows inherited, but still rejected due to prototype
        const proto = { id: "456" };
        const params = Object.create(proto) as { id: string };

        params.id = "123";

        // Objects with custom prototype are always rejected regardless of properties
        expect(() => {
          router.isActiveRoute("users.view", params);
        }).toThrowError("[router.isActiveRoute] Invalid params structure");
      });

      it("should ignore non-enumerable properties", () => {
        router.navigate("users.view", { id: "123" });

        const params: { id: string; hidden?: string } = { id: "123" };

        Object.defineProperty(params, "hidden", {
          value: "secret",
          enumerable: false,
        });

        // Non-enumerable properties are not iterated by for-in
        expect(router.isActiveRoute("users.view", params)).toBe(true);
      });
    });

    describe("defaultParams interaction with undefined", () => {
      it("should allow undefined to override defaultParams", () => {
        // Set defaultParams for users route
        getConfig(router).defaultParams.users = { filter: "active" };

        // Navigate with the default filter
        router.navigate("users.view", { id: "123", filter: "active" });

        // Passing undefined for filter overrides the default
        // effectiveParams = { ...{filter: "active"}, ...{filter: undefined} }
        // = { filter: undefined }
        // Then undefined !== "active" → false
        expect(
          router.isActiveRoute("users", { filter: undefined } as unknown as {
            filter: string;
          }),
        ).toBe(false);
      });

      it("should use defaultParams when param is not provided", () => {
        getConfig(router).defaultParams.users = { filter: "active" };

        router.navigate("users.view", { id: "123", filter: "active" });

        // Empty params → effectiveParams = { filter: "active" }
        // Matches activeState.params.filter = "active"
        expect(router.isActiveRoute("users", {})).toBe(true);
      });

      it("should use provided params over defaultParams", () => {
        getConfig(router).defaultParams.users = { filter: "active" };

        router.navigate("users.view", { id: "123", filter: "inactive" });

        // Explicit filter overrides default
        expect(router.isActiveRoute("users", { filter: "inactive" })).toBe(
          true,
        );
        expect(router.isActiveRoute("users", { filter: "active" })).toBe(false);
      });
    });
  });
});
