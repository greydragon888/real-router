import { describe, it, expect, expectTypeOf } from "vitest";

import { validateRouteName } from "type-guards";

describe("Route Validators", () => {
  describe("isRouteName", () => {
    const methodName = "testMethod";

    describe("Type validation", () => {
      it("should throw TypeError for non-string values", () => {
        const nonStringValues = [
          { value: null, type: "object" },
          { value: undefined, type: "undefined" },
          { value: 123, type: "number" },
          { value: true, type: "boolean" },
          { value: {}, type: "object" },
          { value: [], type: "object" },
          { value: Symbol("test"), type: "symbol" },
          { value: () => {}, type: "function" },
        ];

        nonStringValues.forEach(({ value, type }) => {
          expect(() => {
            validateRouteName(value, methodName);
          }).toThrowError(TypeError);
          expect(() => {
            validateRouteName(value, methodName);
          }).toThrowError(
            `[router.${methodName}] Route name must be a string, got ${type}`,
          );
        });
      });

      it("should not throw for valid string values", () => {
        expect(() => {
          validateRouteName("validRoute", methodName);
        }).not.toThrowError();
      });
    });

    describe("Empty and whitespace validation", () => {
      it("should accept empty string (root node)", () => {
        expect(() => {
          validateRouteName("", methodName);
        }).not.toThrowError();
      });

      it("should throw for strings with only whitespace", () => {
        const whitespaceStrings = [
          " ",
          "  ",
          "\t",
          "\n",
          "\r",
          "\f",
          "   \t\n\r\f   ",
        ];

        whitespaceStrings.forEach((str) => {
          expect(() => {
            validateRouteName(str, methodName);
          }).toThrowError(
            `[router.${methodName}] Route name cannot contain only whitespace`,
          );
        });
      });
    });

    describe("Length validation", () => {
      it("should accept routes up to MAX_ROUTE_NAME_LENGTH", () => {
        const maxLengthRoute = "a".repeat(10_000);

        expect(() => {
          validateRouteName(maxLengthRoute, methodName);
        }).not.toThrowError();
      });

      it("should throw for routes exceeding MAX_ROUTE_NAME_LENGTH", () => {
        const tooLongRoute = "a".repeat(10_001);

        expect(() => {
          validateRouteName(tooLongRoute, methodName);
        }).toThrowError(TypeError);
        expect(() => {
          validateRouteName(tooLongRoute, methodName);
        }).toThrowError(
          `[router.${methodName}] Route name exceeds maximum length of 10000 characters. This is a technical safety limit.`,
        );
      });
    });

    describe("System routes (@@prefix)", () => {
      it("should bypass validation for system routes", () => {
        const systemRoutes = [
          "@@real-router/UNKNOWN_ROUTE",
          "@@system/internal",
          "@@..invalid..normally",
          "@@123-starts-with-number",
          "@@.starts.with.dot",
          "@@ends.with.dot.",
          "@@has..consecutive..dots",
          "@@has spaces and special chars!@#$%",
        ];

        systemRoutes.forEach((route) => {
          expect(() => {
            validateRouteName(route, methodName);
          }).not.toThrowError();
        });
      });

      it("should not treat @ as system route", () => {
        expect(() => {
          validateRouteName("@notSystem", methodName);
        }).toThrowError();
        expect(() => {
          validateRouteName("@", methodName);
        }).toThrowError();
      });
    });

    describe("Dot pattern validation", () => {
      it("should throw for routes starting with dot", () => {
        const routesStartingWithDot = [".users", ".profile", ".admin.panel"];

        routesStartingWithDot.forEach((route) => {
          expect(() => {
            validateRouteName(route, methodName);
          }).toThrowError(TypeError);
        });
      });

      it("should throw for routes ending with dot", () => {
        const routesEndingWithDot = ["users.", "profile.", "admin.panel."];

        routesEndingWithDot.forEach((route) => {
          expect(() => {
            validateRouteName(route, methodName);
          }).toThrowError(TypeError);
        });
      });

      it("should throw for routes with consecutive dots", () => {
        const routesWithConsecutiveDots = [
          "users..profile",
          "admin...panel",
          "a..b..c",
          "test....route",
        ];

        routesWithConsecutiveDots.forEach((route) => {
          expect(() => {
            validateRouteName(route, methodName);
          }).toThrowError(TypeError);
        });
      });

      it("should accept routes with single dots as separators", () => {
        const validDottedRoutes = [
          "users.profile",
          "admin.panel.settings",
          "api.v2.users.profile.edit",
          "a.b.c.d.e.f.g",
        ];

        validDottedRoutes.forEach((route) => {
          expect(() => {
            validateRouteName(route, methodName);
          }).not.toThrowError();
        });
      });
    });

    describe("Segment pattern validation", () => {
      it("should accept segments starting with letter", () => {
        const validSegments = [
          "users",
          "Profile",
          "adminPanel",
          "api_v2",
          "test-route",
          "mixed_123-test",
          "a",
          "Z",
        ];

        validSegments.forEach((segment) => {
          expect(() => {
            validateRouteName(segment, methodName);
          }).not.toThrowError();
        });
      });

      it("should accept segments starting with underscore", () => {
        const validSegments = [
          "_private",
          "_123",
          "_test_route",
          "__double",
          "_",
        ];

        validSegments.forEach((segment) => {
          expect(() => {
            validateRouteName(segment, methodName);
          }).not.toThrowError();
        });
      });

      it("should accept segments with letters, numbers, underscores, and hyphens", () => {
        const validSegments = [
          "user123",
          "test_route",
          "api-v2",
          "mixed_123-test",
          "UPPER_CASE",
          "camelCase",
          "snake_case",
          "kebab-case",
          "Mix3d_Cas3-styl3",
        ];

        validSegments.forEach((segment) => {
          expect(() => {
            validateRouteName(segment, methodName);
          }).not.toThrowError();
        });
      });

      it("should throw for segments starting with number", () => {
        const invalidSegments = ["123", "1test", "999users"];

        invalidSegments.forEach((segment) => {
          expect(() => {
            validateRouteName(segment, methodName);
          }).toThrowError(TypeError);
          expect(() => {
            validateRouteName(segment, methodName);
          }).toThrowError(/Invalid route name/);
        });
      });

      it("should throw for segments starting with hyphen", () => {
        const invalidSegments = ["-test", "-123", "--double"];

        invalidSegments.forEach((segment) => {
          expect(() => {
            validateRouteName(segment, methodName);
          }).toThrowError(TypeError);
          expect(() => {
            validateRouteName(segment, methodName);
          }).toThrowError(/Invalid route name/);
        });
      });

      it("should throw for segments with special characters", () => {
        const invalidSegments = [
          "test@route",
          "user#123",
          "admin$panel",
          "api%v2",
          "test&route",
          "user*profile",
          "admin+panel",
          "test=route",
          "user[0]",
          "admin{panel}",
          "test route", // space
          "user\ttab",
          "admin\nnewline",
        ];

        invalidSegments.forEach((segment) => {
          expect(() => {
            validateRouteName(segment, methodName);
          }).toThrowError(TypeError);
          expect(() => {
            validateRouteName(segment, methodName);
          }).toThrowError(/Invalid route name/);
        });
      });
    });

    describe("Complex route validation", () => {
      it("should validate each segment in dotted paths", () => {
        const invalidRoutes = [
          "users.123profile", // second segment starts with number
          "admin.panel.-settings", // third segment starts with hyphen
          "api.v2.user@profile", // third segment has special char
          "test.route.with space", // segment with space
          "valid.invalid#.valid", // middle segment has special char
        ];

        invalidRoutes.forEach((route) => {
          expect(() => {
            validateRouteName(route, methodName);
          }).toThrowError(TypeError);
          expect(() => {
            validateRouteName(route, methodName);
          }).toThrowError(/Invalid route name/);
        });
      });

      it("should accept valid complex routes", () => {
        const validRoutes = [
          "users.profile.settings",
          "api.v2.users.profile",
          "admin_panel.users_management.permissions",
          "_private.api._internal.v2",
          "a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p",
          "CamelCase.snake_case.kebab-case.Mixed_Style-123",
        ];

        validRoutes.forEach((route) => {
          expect(() => {
            validateRouteName(route, methodName);
          }).not.toThrowError();
        });
      });
    });

    describe("Edge cases", () => {
      it("should handle routes at boundary of MAX_ROUTE_NAME_LENGTH", () => {
        // Route with 9999 characters (just under limit)
        const almostMaxRoute = "a".repeat(9999);

        expect(() => {
          validateRouteName(almostMaxRoute, methodName);
        }).not.toThrowError();

        // Route with exactly 10000 characters
        const exactMaxRoute = "a".repeat(10_000);

        expect(() => {
          validateRouteName(exactMaxRoute, methodName);
        }).not.toThrowError();

        // Route with 10001 characters (just over limit)
        const overMaxRoute = "a".repeat(10_001);

        expect(() => {
          validateRouteName(overMaxRoute, methodName);
        }).toThrowError("exceeds maximum length");
      });

      it("should handle single character routes", () => {
        const validSingleChars = ["a", "Z", "_"];

        validSingleChars.forEach((char) => {
          expect(() => {
            validateRouteName(char, methodName);
          }).not.toThrowError();
        });

        const invalidSingleChars = ["1", "-", "@", " ", "."];

        invalidSingleChars.forEach((char) => {
          expect(() => {
            validateRouteName(char, methodName);
          }).toThrowError();
        });
      });

      it("should accept empty string as special root node case", () => {
        expect(() => {
          validateRouteName("", methodName);
        }).not.toThrowError();

        // Empty string should be treated as string after validation
        const value: unknown = "";

        validateRouteName(value, methodName);

        expectTypeOf(value).toBeString();

        expect(value).toBe("");
      });

      it("should handle Unicode characters", () => {
        const unicodeRoutes = [
          "тест", // Cyrillic
          "测试", // Chinese
          "العربية", // Arabic
          "🚀", // Emoji
          "café", // Accented Latin
        ];

        unicodeRoutes.forEach((route) => {
          expect(() => {
            validateRouteName(route, methodName);
          }).toThrowError(/Invalid route name/);
        });
      });

      it("should preserve error message method name", () => {
        const customMethodName = "customMethod";

        expect(() => {
          validateRouteName(123, customMethodName);
        }).toThrowError(
          `[router.${customMethodName}] Route name must be a string`,
        );

        expect(() => {
          validateRouteName("   ", customMethodName);
        }).toThrowError(
          `[router.${customMethodName}] Route name cannot contain only whitespace`,
        );

        expect(() => {
          validateRouteName("123invalid", customMethodName);
        }).toThrowError(`[router.${customMethodName}] Invalid route name`);
      });
    });
  });
});
