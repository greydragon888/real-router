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

      it("should accept optional parameters", () => {
        const paths = ["/path/:id?", "/users/:userId?/posts", "/:optional?"];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
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
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      // Regression guard (#749): these were the original "#738 breakers" but
      // #738 made them valid configs (lazy quantifier inside a constraint, and
      // hyphen in a param name). The #749 delimiter-balance check must NOT
      // reject them — they have balanced `<...>` / no constraint at all.
      it("should accept hyphenated names and balanced lazy-quantifier constraints", () => {
        const paths = [
          "/h/:my-param",
          String.raw`/a/:id<\d?>`,
          String.raw`/a/:id<\d?>?tab`,
          "/:id<[a<b]>", // `<` legitimately inside a constraint body
        ];

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
          String.raw`/:category/:id<\d+>?page=1`,
          "/files/*path?download=true",
          "~/admin/:section/:id?",
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

    describe("Constraint syntax errors (#749)", () => {
      // An unbalanced `<` desyncs match vs build grammars: the param name is
      // truncated at `<`, but the unclosed constraint survives as a literal in
      // the trie node path, so `buildPath` later throws `Missing required
      // param`. `validateRoute` is the gatekeeper that must reject it early.
      it("should throw for unbalanced constraint delimiters", () => {
        const paths = [
          String.raw`/u/:id<\d+`, // no closing '>'
          "/u/:id<", // dangling '<'
          "/u/:id>", // stray '>' with no '<'
          String.raw`/u/:id<\d+>>`, // extra '>'
          String.raw`/a/:id<\d?>?tab<`, // trailing dangling '<' after a valid constraint
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/constraint/);
        });
      });

      // An empty `<>` is balanced but compiles to a never-matching `^()$`
      // pattern — a dead required param. The gate rejects it route-contextually
      // (#804); path-matcher backstops it at registerTree.
      it("should throw for an empty constraint '<>' (#804)", () => {
        const paths = [
          "/u/:id<>", // empty constraint
          "/x/:id<>?/y", // empty constraint before an optional marker
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/empty constraint/);
        });
      });

      // A constraint body that is BALANCED and non-empty (so it clears the two
      // checks above) but is NOT a valid regular expression — `<*x>`, `<(>`, `<[>`.
      // `buildParamMeta` throws a plain `Error` compiling the body to a `RegExp`
      // (path-matcher #1324); `validateRoutePath` wraps that call so it surfaces as
      // the gate's route-contextual `TypeError`, not a bare `[buildParamMeta]` Error
      // — the one malformed class that used to escape the gate contract (F1-residual).
      it("should re-throw an invalid-regex constraint body as a route-contextual TypeError (#1324)", () => {
        const paths = [
          "/u/:id<*x>", // leading quantifier — "Nothing to repeat"
          "/u/:id<(>", // unterminated group
          "/u/:id<[>", // unterminated character class
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(TypeError);
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/^\[router\./);
        });
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

      it("should throw for static text fused to a constraint '>' (#1150)", () => {
        const paths = [
          String.raw`/:year<\d+>-archive`, // static suffix after a constraint
          String.raw`/post/:id<\d+>.html`, // ".html" suffix
          String.raw`/x/:id<\d+>x`, // letter suffix
          String.raw`/x/:a<\d+>:b`, // a second marker fused after the constraint
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/fused to a constraint/u);
        });
      });

      it("should NOT flag a constraint that ends its segment (controls, #1150)", () => {
        const paths = [
          String.raw`/:id<\d+>`, // constraint at end of path
          String.raw`/:id<\d+>/edit`, // followed by a segment boundary
          String.raw`/:id<\d+>?`, // followed by an optional marker
          "/:id<[a<b]>", // '<' inside the constraint body
          "/:id<[a/b]>", // '/' inside the constraint body
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      it("should throw for a `<...>` constraint in a clean static segment (#1311)", () => {
        const paths = [
          "/foo<bar>", // constraint filling a static segment
          "/a<b>", // minimal
          String.raw`/x<\d+>`, // constraint body on a static segment
          "/users/x<[a/b]>", // '/' inside the constraint body, static segment
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/constraint '<\.\.\.>' in a static segment/u);
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
        const paths = ["/:a/:b", "/a/:b?/:c?/d", "/:x/*rest"];

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

      it("should NOT flag percent-encoded statics, non-ASCII param names, or constraints (control, #1154)", () => {
        const paths = [
          "/caf%C3%A9", // percent-encoded — already works today
          "/:café", // a non-ASCII PARAM name (only static text is compared raw)
          "/:id<[а-я]+>", // a Cyrillic constraint body (matched against decoded value)
          "/users",
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      it("should throw for a constraint leaked into a query name (#1242 §5.1)", () => {
        expect(() => {
          validatePath(String.raw`/a/:b?<\d+>`, routeName, methodName);
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

      it("should throw for an optional splat '*name?' (#1149)", () => {
        const paths = [
          "/files/*path?", // optional splat
          "/:lang?/files/*rest?", // optional splat after an optional param
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/optional splat/u);
        });
      });

      it("should NOT flag a required splat followed by a query (control, #1149)", () => {
        // `?download` is the query separator, `*path` a required splat — the
        // query-stripped pathPattern has no optional marker on the splat.
        expect(() => {
          validatePath("/files/*path?download", routeName, methodName);
        }).not.toThrow();
      });

      it("should throw for an unconstrained optional param before a splat (#1264)", () => {
        const paths = ["/:v?/*rest", "/:lang?/*path", "/api/:version?/*rest"];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/unconstrained optional param before a splat/u);
        });
      });

      it("should NOT flag a CONSTRAINED optional before a splat, nor opt→param/static (#1264)", () => {
        const paths = [
          String.raw`/:v<v\d+>?/*rest`, // constrained → try-take-if-valid (A1)
          "/:id<[^/]+>?/*rest", // constraint containing '/'
          "/:a?/:b", // optional before a param, not a splat (A2)
          "/:lang?/home", // optional before a static
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
      });

      it("should throw for two optional params directly before a splat (#1287)", () => {
        const paths = [
          "/:a<[a-z]+>?/:b<[a-z]+>?/*rest", // two constrained optionals before a splat
          "/:a<[^/]+>?/:b<[^/]+>?/*rest", // constraint containing '/'
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).toThrow(/two optional params directly before a splat/u);
        });
      });

      it("reports the #1287 reason (not #1264) for TWO UNCONSTRAINED optionals before a splat — aligned with the registerTree backstop", () => {
        // `/:a?/:b?/*rest` triggers BOTH #1264 (an unconstrained optional before the
        // splat) and #1287 (two optionals before the splat). The path-matcher backstop
        // reports #1287 first (registerNode runs before markOptionalFork's #1264 throw);
        // the gate must too, so the two layers give the SAME reject reason. The
        // gate↔backstop parity property only checks the reject BOOLEAN, so this reason
        // divergence was invisible to it. #1287's "split / drop the '?'" is the correct
        // fix — the #1264 "add a constraint" hint is a dead end (`/:a<c>?/:b<c>?/*rest`
        // is still rejected by #1287).
        expect(() => {
          validatePath("/:a?/:b?/*rest", routeName, methodName);
        }).toThrow(/two optional params directly before a splat/u);
      });

      it("should NOT flag a single constrained optional before a splat (#1287)", () => {
        const paths = [
          "/:v<[a-z]+>?/*rest", // one constrained optional → supported (#1264 A1)
          "/:a<[a-z]+>?/:b<[a-z]+>?/end", // two optionals, but before a static
        ];

        paths.forEach((path) => {
          expect(() => {
            validatePath(path, routeName, methodName);
          }).not.toThrow();
        });
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
