// packages/route-node/tests/functional/validation-routes.test.ts

import { describe, it, expect } from "vitest";

import { createRouteTree, validateRoute } from "../../../src/engine";

import type { RouteTree } from "../../../src/engine";

// White-box audit (whitebox-audit skill): these path-format cases exercise the
// internal `validateRoutePath` gate through the PUBLIC `validateRoute` entry — the
// only door core opens to it. `validatePath` wraps `validateRoute({ name, path }, …)`
// so each `it` reads as a path assertion while the call is a genuine public-API
// call: a valid `name` clears validateRoute's own name/type guards, so path
// validation always runs and its thrown TypeError (message-identical to the direct
// call) surfaces unchanged. The `~`-under-parameterized-parent branch uses a REAL
// `createRouteTree` param root (not a mock), proven publicly reachable in the audit.
describe("validateRoutePath (via public validateRoute)", () => {
  const methodName = "testMethod";
  const routeName = "testRoute";

  function validatePath(
    path: unknown,
    name: string,
    method: string,
    parent?: RouteTree,
  ): void {
    validateRoute({ name, path }, method, parent);
  }

  describe("Valid paths", () => {
    describe("Basic paths", () => {
      it("should accept empty string (root/grouping)", () => {
        expect(() => {
          validatePath("", routeName, methodName);
        }).not.toThrow();
      });

      it("should accept root path", () => {
        expect(() => {
          validatePath("/", routeName, methodName);
        }).not.toThrow();
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
            validatePath(path, routeName, methodName);
          }).not.toThrow();
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
            validatePath(segment, routeName, methodName);
          }).not.toThrow();
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
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      it("should accept splat parameters", () => {
        // Named splats only. A bare `/*` is a NAME-LESS marker — path-matcher
        // rejects it at registerTree (#858), so the gate rejects it too (#863);
        // the catch-all form is the named `/*rest`, asserted invalid below.
        const paths = ["/*rest", "/files/*path", "/api/*endpoint"];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      // #738: a param name may carry non-word chars (hyphen), and a `?` tail is
      // the query separator (param stays required) — all valid 3-token forms.
      it("should accept hyphenated names and a query tail after a param", () => {
        const paths = ["/h/:my-param", "/a/:id?tab", "/users/:id/posts/:pid"];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
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
            validatePath(path, routeName, methodName);
          }).not.toThrow();
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
            validatePath(path, routeName, methodName);
          }).not.toThrow();
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
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      it("should accept absolute paths with non-parameterized parent", () => {
        const parentNode = createRouteTree("parent", "/parent", []);

        expect(() => {
          validatePath("~/absolute", routeName, methodName, parentNode);
        }).not.toThrow();
      });
    });

    describe("Complex combinations", () => {
      it("should accept complex valid paths", () => {
        const paths = [
          "/api/v2/users/:id/posts/*rest",
          "/:category/:id?page=1",
          "/files/*path?download=true",
          "~/admin/:section/:id",
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
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
            validatePath(value, routeName, methodName);
          }).toThrow(/Route path must be a string/);
        });
      });

      it("should include correct type in error message for arrays", () => {
        expect(() => {
          validatePath([], routeName, methodName);
        }).toThrow(/Route path must be a string, got array/);
      });
    });

    describe("Whitespace errors", () => {
      it("should throw for paths with spaces", () => {
        expect(() => {
          validatePath("/with space", routeName, methodName);
        }).toThrow(/whitespace not allowed/);
      });

      it("should throw for paths with tabs", () => {
        expect(() => {
          validatePath("/with\ttab", routeName, methodName);
        }).toThrow(/whitespace not allowed/);
      });

      it("should throw for paths with newlines", () => {
        expect(() => {
          validatePath("/with\nnewline", routeName, methodName);
        }).toThrow(/whitespace not allowed/);
      });

      it("should throw for paths with carriage return", () => {
        expect(() => {
          validatePath("/with\rcarriage", routeName, methodName);
        }).toThrow(/whitespace not allowed/);
      });

      it("should include path in whitespace error message", () => {
        const pathWithSpace = "/my path";

        expect(() => {
          validatePath(pathWithSpace, routeName, methodName);
        }).toThrow(`whitespace not allowed in "${pathWithSpace}"`);
      });
    });

    describe("Format errors", () => {
      it("should throw for paths with double slashes", () => {
        const paths = ["//users", "/users//list", "/api//v2", "///", "/path//"];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/double slashes not allowed/);
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
            validatePath(path, routeName, methodName);
          }).toThrow(/invalid path format/);
        });
      });
    });

    // Every `<`/`>` in a path (a `<re>` constraint, an `<>`, an invalid-regex
    // body, a `<...>` in a static segment, or a stray `>`) is rejected with the
    // route-contextual "regex constraints are not supported" recipe. path-matcher
    // backstops the same forms at `registerTree` with a shorter recipe.
    describe("removed forms — regex constraints (M1)", () => {
      it("throws the constraint recipe for any `<...>` / stray `<`,`>`", () => {
        const paths = [
          String.raw`/:id<\d+>`, // a former constraint
          "/:uuid<[a-f0-9]{8}>",
          "/u/:id<", // dangling '<' (was #804 unbalanced)
          "/u/:id>", // stray '>' (В1.3)
          "/u/:id<>", // empty '<>' (was #804)
          "/u/:id<*x>", // former invalid-regex body — no longer compiled
          "/foo<bar>", // constraint filling a static segment (was #1311)
          "/a>b", // a stray '>' in a static segment (В1.3)
          String.raw`/:year<\d+>-archive`, // was fused-constraint-suffix (#1150)
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/regex constraints are not supported/u);
        });
      });

      it("names the offending segment and reserves '<'/'>' in the recipe", () => {
        expect(() => {
          validatePath(String.raw`/users/:id<\d+>`, "u", "add");
        }).toThrow(/'<' and '>' are reserved in path segments/u);
      });

      it("the recipe is a route-contextual TypeError", () => {
        expect(() => {
          validatePath(String.raw`/:id<\d+>`, routeName, methodName);
        }).toThrow(TypeError);
        expect(() => {
          validatePath(String.raw`/:id<\d+>`, routeName, methodName);
        }).toThrow(/^\[router\./);
      });
    });

    describe("Name-less parameter markers (#863)", () => {
      // A `:`/`*` with no name passes every format check above but path-matcher
      // rejects it at `registerTree` (#858) with a non-route-contextual error.
      // The gate rejects it earlier, derived from the single `PARAM_NAME_PATTERN`.
      it("should throw for a marker with no parameter name", () => {
        const paths = [
          "/:", // bare colon at root
          "/*", // bare splat at root (NOT a catch-all — name-less)
          "/x/:", // bare colon at end
          "/x/*", // bare splat at end
          "/x/:?", // colon + optional modifier, no name
          String.raw`/x/:<\d+>`, // colon + constraint, no name
          "/x/:/n", // colon at a segment boundary
          "/x/*/n", // splat at a segment boundary
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/parameter marker/);
        });
      });

      it("should NOT flag a `:`/`*` inside a query declaration (url-path scope)", () => {
        // The query portion is not trie'd, so a name-less marker there is not a
        // url-param — must not be falsely rejected (no divergence from matcher).
        expect(() => {
          validatePath("/x?:", routeName, methodName);
        }).not.toThrow();
      });
    });

    describe("Fused mid-segment markers (#1050)", () => {
      // A `:`/`*` marker fused to a static prefix WITHIN a segment (`/a:b`,
      // `/users/x:id`, `/a*b`): build/meta's unanchored regex extracts it as a
      // param, but the trie honors a marker only at segment start and compiles
      // the segment as a literal — so buildPath emits an unmatchable URL while
      // match() rejects it. The gate rejects it (path-matcher backstops at
      // registerTree), the sibling of the #863 name-less rejection.
      it("should throw for a marker fused to a static prefix", () => {
        const paths = [
          "/a:b", // colon fused mid-segment
          "/users/x:id", // colon after a static prefix in a nested segment
          "/a*b", // splat fused mid-segment
          "/users/x*rest", // splat after a static prefix
          String.raw`/a:b<\d+>`, // fused colon carrying a constraint
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/Invalid path for route/u);
        });
      });

      it("should throw for a duplicate param name within one route (#1151)", () => {
        const paths = [
          "/:id/:id", // same name, two segments
          "/:x/*x", // param + splat name clash
          "/a/:id/b/:id", // repeated across static segments
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/duplicate parameter name/u);
        });
      });

      it("should NOT flag distinct param names (control, #1151)", () => {
        const paths = ["/:a/:b", "/a/:b/:c/d", "/:x/*rest"];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      it("should throw for a non-ASCII static segment (#1154)", () => {
        const paths = ["/café", "/меню", "/新闻", "/a/café/b"];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/non-ASCII static segment/u);
        });
      });

      it("should NOT flag percent-encoded statics or non-ASCII param names (control, #1154)", () => {
        const paths = [
          "/caf%C3%A9", // percent-encoded — already works today
          "/:café", // a non-ASCII PARAM name (only static text is compared raw)
          "/users",
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      it("should throw for a `<`/`>` in a query name (#1242 §5.1)", () => {
        // A real query declaration whose NAME carries `<`/`>` (e.g. a reverse-order
        // typo `?a<b`) is still rejected as an invalid query-param name.
        expect(() => {
          validatePath("/path?a<b", routeName, methodName);
        }).toThrow(/invalid query-param name/u);
      });

      it("should throw for a path-param / query-param name collision (#1242 §5.3)", () => {
        expect(() => {
          validatePath("/a/:tab?tab", routeName, methodName);
        }).toThrow(/declared as both a path param and a query param/u);
      });

      it("should NOT flag clean query declarations, incl. tolerated ?name=value (control, #1242)", () => {
        const paths = [
          "/a?valid",
          "/a/:id?q",
          "/a?a&b",
          "/a?tab=1", // '=' in the declaration is tolerated (§5.2 not folded in)
          "/search?first&second",
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      // M1: optional `:x?` (and optional splat `*x?`) were removed. Every optional
      // form — bare, before a splat, before a param, or two in a row — is rejected
      // with the route-contextual "optional params are not supported" recipe.
      it("throws the optional recipe for any `:x?` / `*x?`", () => {
        const paths = [
          "/:id?", // bare optional
          "/files/*path?", // optional splat (was #1149)
          "/:v?/*rest", // optional before a splat (was #1264)
          "/:a?/:b", // optional before a param
          "/:lang?/home", // optional before a static
          "/:a?/:b?/*rest", // two optionals before a splat (was #1287)
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/optional params are not supported/u);
        });
      });

      it("should NOT flag a required splat followed by a query (control)", () => {
        // `?download` is the query separator, `*path` a required splat.
        expect(() => {
          validatePath("/files/*path?download", routeName, methodName);
        }).not.toThrow();
      });

      // В1.1 rich tier: the gate recipe names the offending segment and computes
      // the two replacement sibling paths from the ACTUAL path.
      it("computes the two sibling routes for the optional recipe", () => {
        expect(() => {
          validatePath("/profile/:tab?", "p", "add");
        }).toThrow(
          /optional params are not supported — ":tab\?"\. Declare two sibling routes instead: "\/profile" and "\/profile\/:tab"/u,
        );
      });

      it("computes siblings for a MID-PATH optional (// collapses)", () => {
        expect(() => {
          validatePath("/a/:b?/c", "p", "add");
        }).toThrow(
          /Declare two sibling routes instead: "\/a\/c" and "\/a\/:b\/c"/u,
        );
      });

      // #1516 review: a reverse/compound optional (`?` NOT the segment's last char
      // — `:b?<x>` is a §3.3 boundary pin that stays a path segment). The required
      // sibling must drop the WHOLE `?…` modifier tail, not a blind last char — so
      // it is a VALID route `/a/:b`, not the malformed `/a/:b?<x` a `slice(0,-1)`
      // would emit. A user copying the recipe's sibling must get a registerable path.
      it("yields a VALID required sibling for a reverse/compound optional", () => {
        expect(() => {
          validatePath("/a/:b?<x>", "p", "add");
        }).toThrow(
          /optional params are not supported .*Declare two sibling routes instead: "\/a" and "\/a\/:b"/u,
        );
        // the degenerate double-`?` collapses to the plain required param too
        expect(() => {
          validatePath("/:id??", "p", "add");
        }).toThrow(/Declare two sibling routes instead: "" and "\/:id"/u);
      });

      it("should NOT flag a boundary marker or a marker-led greedy name (controls)", () => {
        const paths = [
          "/a/:b", // boundary marker — the canonical correct form
          "/users/:id", // boundary marker
          "/:a:b", // marker-led: the param name is the greedy 'a:b', not a fused marker
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      it("should NOT flag a fused-looking marker inside a query declaration (url-path scope)", () => {
        // Same url-path scope as #863: the query portion is not trie'd, so a
        // `:`/`*` there is not a path marker — must not be falsely rejected.
        expect(() => {
          validatePath("/users?x:y", routeName, methodName);
        }).not.toThrow();
      });
    });

    describe("Absolute paths with parameterized parent", () => {
      it("should throw when parent has URL parameters", () => {
        const parentWithParams = createRouteTree("parent", "/parent/:id", []);

        expect(() => {
          validatePath("~/absolute", routeName, methodName, parentWithParams);
        }).toThrow(
          /Absolute path .* cannot be used under parent route with URL parameters/,
        );
      });

      it("should throw for various absolute paths under parameterized parent", () => {
        const parentWithParams = createRouteTree(
          "parent",
          "/users/:userId",
          [],
        );

        const absolutePaths = ["~/dashboard", "~/admin", "~/users/:id", "~/"];

        absolutePaths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName, parentWithParams);
          }).toThrow(/cannot be used under parent route with URL parameters/);
        });
      });

      it("should allow non-tilde paths under parameterized parent", () => {
        const parentWithParams = createRouteTree(
          "parent",
          "/users/:userId",
          [],
        );

        // These paths should be allowed (not absolute)
        const relativePaths = ["/dashboard", "dashboard", "", ":id"];

        relativePaths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName, parentWithParams);
          }).not.toThrow();
        });
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle very long paths", () => {
      const longPath = `/${"a".repeat(1000)}`;

      expect(() => {
        validatePath(longPath, routeName, methodName);
      }).not.toThrow();
    });

    it("should handle paths with many segments", () => {
      const deepPath = `/${Array.from({ length: 100 }, () => "segment").join("/")}`;

      expect(() => {
        validatePath(deepPath, routeName, methodName);
      }).not.toThrow();
    });

    it("rejects unicode static segments with the percent-encode hint (#1154)", () => {
      // Raw non-ASCII statics register but never match (match compares static keys
      // raw and rejects non-ASCII input) — the #1154 dead-route class. Rejected at
      // the gate now; percent-encode the segment instead.
      const unicodePaths = ["/użytkownik", "/用户", "/مستخدم", "/пользователь"];

      unicodePaths.forEach((path) => {
        expect(() => {
          validatePath(path, routeName, methodName);
        }).toThrow(/non-ASCII static segment/u);
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
          validatePath(path, routeName, methodName);
        }).not.toThrow();
      });
    });
  });

  describe("Error messages", () => {
    it("should include route name in error message", () => {
      // A dotted name (`users.view`) is rejected by validateRoute's name guard
      // BEFORE path validation; use a valid name — `routeDef.name` still flows
      // into validateRoutePath's error, which is what this asserts.
      const testRouteName = "usersView";

      expect(() => {
        validatePath("//", testRouteName, methodName);
      }).toThrow(new RegExp(testRouteName));
    });

    it("should include method name in error message", () => {
      const testMethodName = "addRoute";

      expect(() => {
        validatePath("//", routeName, testMethodName);
      }).toThrow(new RegExp(testMethodName));
    });

    it("should include the invalid path in error message", () => {
      const invalidPath = "//invalid//path";

      expect(() => {
        validatePath(invalidPath, routeName, methodName);
      }).toThrow(
        new RegExp(
          invalidPath.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`),
        ),
      );
    });

    it("should provide helpful error message for type errors", () => {
      expect(() => {
        validatePath(123, routeName, methodName);
      }).toThrow(/Route path must be a string, got number/);

      expect(() => {
        validatePath(null, routeName, methodName);
      }).toThrow(/Route path must be a string, got null/);

      expect(() => {
        validatePath(undefined, routeName, methodName);
      }).toThrow(/Route path must be a string, got undefined/);
    });
  });
});
