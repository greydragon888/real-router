// packages/route-node/tests/functional/validation-routes.test.ts

import { describe, it, expect } from "vitest";

import { validateRoutePath } from "../../modules/validation/routes";
// eslint-disable-next-line vitest/no-mocks-import -- intentional: using mock factory, not vi.mock
import {
  createMockRouteNode,
  createMockParameterizedNode,
} from "../__mocks__/route-tree-mock";

describe("validateRoutePath", () => {
  const methodName = "testMethod";
  const routeName = "testRoute";

  describe("Valid paths", () => {
    describe("Basic paths", () => {
      it("should accept empty string (root/grouping)", () => {
        expect(() => {
          validateRoutePath("", routeName, methodName);
        }).not.toThrowError();
      });

      it("should accept root path", () => {
        expect(() => {
          validateRoutePath("/", routeName, methodName);
        }).not.toThrowError();
      });

      it("should accept static paths", () => {
        const paths = [
          "/users",
          "/users/list",
          "/api/v2/resources",
          "/kebab-case-path",
          "/snake_case_path",
          "/path.with.dots",
        ];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).not.toThrowError();
        });
      });

      it("should accept relative segments", () => {
        const segments = [
          "segment",
          "users",
          "admin-panel",
          "api_v2",
          "file.txt",
        ];

        segments.forEach((segment) => {
          expect(() => {
            validateRoutePath(segment, routeName, methodName);
          }).not.toThrowError();
        });
      });
    });

    describe("Parameterized paths", () => {
      it("should accept URL parameters", () => {
        const paths = [
          "/:id",
          "/users/:userId",
          "/posts/:postId/comments/:commentId",
          "/:param1/:param2/:param3",
        ];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).not.toThrowError();
        });
      });

      it("should accept splat parameters", () => {
        const paths = ["/*", "/*rest", "/files/*path", "/api/*endpoint"];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).not.toThrowError();
        });
      });

      it("should accept optional parameters", () => {
        const paths = ["/path/:id?", "/users/:userId?/posts", "/:optional?"];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).not.toThrowError();
        });
      });

      it("should accept regex constraints", () => {
        const paths = [
          String.raw`/:id<\d+>`,
          "/:uuid<[a-f0-9]{8}>",
          String.raw`/posts/:id<\d{1,10}>`,
          "/:param<[A-Z]+>",
        ];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).not.toThrowError();
        });
      });
    });

    describe("Query parameters", () => {
      it("should accept query-only paths", () => {
        const paths = [
          "?page",
          "?page&sort",
          "?filter=active&limit=10",
          "?a&b&c&d",
        ];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).not.toThrowError();
        });
      });

      it("should accept paths with query parameters", () => {
        const paths = [
          "/users?page",
          "/search?q=term&limit=10",
          "/:id?edit=true",
        ];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).not.toThrowError();
        });
      });
    });

    describe("Absolute paths", () => {
      it("should accept absolute paths without parent", () => {
        const paths = [
          "~/absolute",
          "~/admin/dashboard",
          "~/:id",
          "~/users/:userId",
        ];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).not.toThrowError();
        });
      });

      it("should accept absolute paths with non-parameterized parent", () => {
        const parentNode = createMockRouteNode("parent", "/parent");

        expect(() => {
          validateRoutePath("~/absolute", routeName, methodName, parentNode);
        }).not.toThrowError();
      });
    });

    describe("Complex combinations", () => {
      it("should accept complex valid paths", () => {
        const paths = [
          "/api/v2/users/:id/posts/*rest",
          String.raw`/:category/:id<\d+>?page=1`,
          "/files/*path?download=true",
          "~/admin/:section/:id?",
        ];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).not.toThrowError();
        });
      });
    });
  });

  describe("Invalid paths", () => {
    describe("Type errors", () => {
      it("should throw for non-string values", () => {
        const invalidValues = [
          null,
          undefined,
          123,
          true,
          false,
          {},
          [],
          () => {},
          Symbol("path"),
          new Date(),
        ];

        invalidValues.forEach((value) => {
          expect(() => {
            validateRoutePath(value, routeName, methodName);
          }).toThrowError(/Route path must be a string/);
        });
      });

      it("should include correct type in error message for arrays", () => {
        expect(() => {
          validateRoutePath([], routeName, methodName);
        }).toThrowError(/Route path must be a string, got array/);
      });
    });

    describe("Whitespace errors", () => {
      it("should throw for paths with spaces", () => {
        expect(() => {
          validateRoutePath("/with space", routeName, methodName);
        }).toThrowError(/whitespace not allowed/);
      });

      it("should throw for paths with tabs", () => {
        expect(() => {
          validateRoutePath("/with\ttab", routeName, methodName);
        }).toThrowError(/whitespace not allowed/);
      });

      it("should throw for paths with newlines", () => {
        expect(() => {
          validateRoutePath("/with\nnewline", routeName, methodName);
        }).toThrowError(/whitespace not allowed/);
      });

      it("should throw for paths with carriage return", () => {
        expect(() => {
          validateRoutePath("/with\rcarriage", routeName, methodName);
        }).toThrowError(/whitespace not allowed/);
      });

      it("should include path in whitespace error message", () => {
        const pathWithSpace = "/my path";

        expect(() => {
          validateRoutePath(pathWithSpace, routeName, methodName);
        }).toThrowError(`whitespace not allowed in "${pathWithSpace}"`);
      });
    });

    describe("Format errors", () => {
      it("should throw for paths with double slashes", () => {
        const paths = ["//users", "/users//list", "/api//v2", "///", "/path//"];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).toThrowError(/double slashes not allowed/);
        });
      });

      it("should throw for invalid path formats", () => {
        const paths = [
          "path/with/slash", // Relative with slash in middle
          "../parent", // Parent directory notation
          "./current", // Current directory notation
          "path/", // Relative ending with slash
        ];

        paths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName);
          }).toThrowError(/invalid path format/);
        });
      });
    });

    describe("Absolute paths with parameterized parent", () => {
      it("should throw when parent has URL parameters", () => {
        const parentWithParams = createMockParameterizedNode(
          "parent",
          "/parent/:id",
        );

        expect(() => {
          validateRoutePath(
            "~/absolute",
            routeName,
            methodName,
            parentWithParams,
          );
        }).toThrowError(
          /Absolute path .* cannot be used under parent route with URL parameters/,
        );
      });

      it("should throw for various absolute paths under parameterized parent", () => {
        const parentWithParams = createMockParameterizedNode(
          "parent",
          "/users/:userId",
        );

        const absolutePaths = ["~/dashboard", "~/admin", "~/users/:id", "~/"];

        absolutePaths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName, parentWithParams);
          }).toThrowError(
            /cannot be used under parent route with URL parameters/,
          );
        });
      });

      it("should allow non-tilde paths under parameterized parent", () => {
        const parentWithParams = createMockParameterizedNode(
          "parent",
          "/users/:userId",
        );

        // These paths should be allowed (not absolute)
        const relativePaths = ["/dashboard", "dashboard", "", ":id"];

        relativePaths.forEach((path) => {
          expect(() => {
            validateRoutePath(path, routeName, methodName, parentWithParams);
          }).not.toThrowError();
        });
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle very long paths", () => {
      const longPath = `/${"a".repeat(1000)}`;

      expect(() => {
        validateRoutePath(longPath, routeName, methodName);
      }).not.toThrowError();
    });

    it("should handle paths with many segments", () => {
      const deepPath = `/${Array.from({ length: 100 }).fill("segment").join("/")}`;

      expect(() => {
        validateRoutePath(deepPath, routeName, methodName);
      }).not.toThrowError();
    });

    it("should handle paths with unicode characters", () => {
      const unicodePaths = ["/użytkownik", "/用户", "/مستخدم", "/пользователь"];

      unicodePaths.forEach((path) => {
        expect(() => {
          validateRoutePath(path, routeName, methodName);
        }).not.toThrowError();
      });
    });

    it("should handle paths with special but valid characters", () => {
      const specialPaths = [
        "/@user",
        "/user-123",
        "/user_456",
        "/user.profile",
        "/$special",
        "/!important",
      ];

      specialPaths.forEach((path) => {
        expect(() => {
          validateRoutePath(path, routeName, methodName);
        }).not.toThrowError();
      });
    });
  });

  describe("Error messages", () => {
    it("should include route name in error message", () => {
      const testRouteName = "users.view";

      expect(() => {
        validateRoutePath("//", testRouteName, methodName);
      }).toThrowError(new RegExp(testRouteName));
    });

    it("should include method name in error message", () => {
      const testMethodName = "addRoute";

      expect(() => {
        validateRoutePath("//", routeName, testMethodName);
      }).toThrowError(new RegExp(testMethodName));
    });

    it("should include the invalid path in error message", () => {
      const invalidPath = "//invalid//path";

      expect(() => {
        validateRoutePath(invalidPath, routeName, methodName);
      }).toThrowError(
        new RegExp(
          invalidPath.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`),
        ),
      );
    });

    it("should provide helpful error message for type errors", () => {
      expect(() => {
        validateRoutePath(123, routeName, methodName);
      }).toThrowError(/Route path must be a string, got number/);

      expect(() => {
        validateRoutePath(null, routeName, methodName);
      }).toThrowError(/Route path must be a string, got null/);

      expect(() => {
        validateRoutePath(undefined, routeName, methodName);
      }).toThrowError(/Route path must be a string, got undefined/);
    });
  });

  describe("Performance considerations", () => {
    it("should handle early return for empty string efficiently", () => {
      // Empty string should return immediately without further checks
      const start = performance.now();

      for (let i = 0; i < 10_000; i++) {
        validateRoutePath("", routeName, methodName);
      }

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should be very fast
    });

    it("should validate typical paths efficiently", () => {
      const paths = [
        "/users",
        "/users/:id",
        String.raw`/:id<\d+>`,
        "?page=1",
        "~/absolute",
      ];

      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        paths.forEach((path) => {
          validateRoutePath(path, routeName, methodName);
        });
      }

      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should be reasonably fast
    });
  });
});
