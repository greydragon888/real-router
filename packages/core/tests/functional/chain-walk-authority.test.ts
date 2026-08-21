import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every place core walks the PROTOTYPE CHAIN of an object it did not build.
 *
 * ⚑ The project's supported-input rule is **own enumerable properties only** — a
 * caller's inherited or non-enumerable properties are not input. Two syntactic
 * shapes reach past it:
 *
 * - **`for…in`** enumerates inherited enumerable keys. Guarded by an
 *   `Object.hasOwn` at the head of the body it is exactly `Object.keys`; without
 *   one it admits what the rule excludes.
 * - **`key in obj`** on a value the function RECEIVED — a parameter, a member
 *   reached through one (`b.params`), a local bound to one (`const obj =
 *   config!`), or `this` — the same walk, used as a predicate. Paired with an
 *   own-only writer (`hasOwn`, a spread, `Object.keys`) the two disagree
 *   precisely on inherited keys, which is how `areStatesEqual` came to report
 *   two states with disjoint own `params` as equal.
 *
 * ⚠ **The one declared blind spot**: a local initialised from a CALL
 * (`const applied = compileFactory(f); … methodName in applied`) is not
 * followed, because this scan cannot say whether the callee built the value or
 * handed back the caller's. `PluginsNamespace.#startPlugin` is such a site
 * today. Widening to it is a scope decision, not a bug fix — but it is a gap,
 * and it is written down rather than left to be discovered.
 *
 * ⚠ **Neither shape is wrong by itself**, and this table does not pretend
 * otherwise. Walking the chain is CORRECT on an `Error` (`"cause" in thrown`), on
 * the router instance (methods live on the prototype), and on any bag core built
 * a line earlier. Every entry therefore carries a verdict and a reason, and the
 * assertion is on the whole set: a new site must be classified, not merely added.
 *
 * ⚠ **Addressed by file + the matched text, never by line number** — the sites
 * this file exists to watch are edited often, and a `:NNN` citation rots on the
 * first reformat.
 *
 * Sibling authorities: `tree-mutator-guard-authority-1751`, `type-mirror-authority`,
 * `read-count-authority`.
 */
describe("where core walks a chain it does not own", () => {
  const SRC = path.resolve(__dirname, "../../src");

  interface Site {
    readonly file: string;
    readonly shape: "for-in" | "in-on-param";
    readonly code: string;
  }

  function scan(): Site[] {
    const found: Site[] = [];

    for (const file of globSync(`${SRC}/**/*.ts`)) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        // `true`: the `in`-on-a-parameter test walks up to the enclosing
        // function. Without parent pointers that walk silently finds nothing and
        // the whole C half reports zero — which it did, on the first run.
        /* setParentNodes */ true,
        ts.ScriptKind.TS,
      );
      const relativePath = path.relative(SRC, file);
      const head = (node: ts.Node): string =>
        node.getText(source).split("\n", 1)[0].trim().slice(0, 60);

      /**
       * The value a subject actually names, with the TYPE-ONLY wrappers peeled.
       *
       * ⚠ Matching `right.getText() === parameterName` compared SPELLINGS, so
       * every wrapper that erases at compile time hid the walk from this scan.
       * Measured on this file's own subject: `CONFIG_FAULT in (error as object)`
       * — the shape `SegmentMatcher` shipped — counted as ZERO sites and the
       * table stayed green, while the identical line without the cast reds it.
       * `as`, `satisfies`, `<T>x`, `x!` and a bare `(x)` all did it; none of them
       * changes which object is walked at run time, which is the only thing this
       * file is about.
       */
      const subjectOf = (expression: ts.Expression): ts.Expression => {
        let current = expression;

        while (
          ts.isParenthesizedExpression(current) ||
          ts.isAsExpression(current) ||
          ts.isSatisfiesExpression(current) ||
          ts.isTypeAssertionExpression(current) ||
          ts.isNonNullExpression(current)
        ) {
          current = current.expression;
        }

        return current;
      };

      /**
       * The value a subject is REACHED THROUGH, with the member steps removed
       * as well.
       *
       * ⚠ `subjectOf` alone still compared a spelling: only a BARE parameter
       * name counted, so `"K" in bag.inner`, `"K" in (bag?.inner as object)`
       * and `"K" in rest[0]` each walked the caller's chain and reported ZERO
       * sites. A member of the caller's bag is still the caller's bag —
       * `recordsShallowEqual(a, b)` inlined as `key in b.params` is the
       * §8 defect verbatim, invisible.
       */
      const rootOf = (expression: ts.Expression): ts.Expression => {
        let current = subjectOf(expression);

        while (
          ts.isPropertyAccessExpression(current) ||
          ts.isElementAccessExpression(current)
        ) {
          current = subjectOf(current.expression);
        }

        return current;
      };

      /**
       * Every name a parameter binds — a destructured one binds its ELEMENTS, and
       * `{ bag }: X` never had a parameter whose text was `bag` to compare against.
       */
      const boundNames = (name: ts.BindingName, into: string[]): string[] => {
        if (ts.isIdentifier(name)) {
          into.push(name.text);
        } else {
          for (const element of name.elements) {
            if (ts.isBindingElement(element)) {
              boundNames(element.name, into);
            }
          }
        }

        return into;
      };

      /**
       * Whether a name is bound to a value the function RECEIVED — a parameter,
       * or a local whose initializer is reached through one.
       *
       * ⚑ The alias hop is not a nicety. `const obj = config!` (`assertLoggerConfig`),
       * `let node = startNode` (`SegmentMatcher`) and
       * `const [a, b] = factories` (`getRoutesApi`) each rebind a parameter one
       * line before the `in`, and each hid eleven sites from a scan that only
       * matched parameter names.
       *
       * A local initialised from a CALL is NOT followed — the scan cannot say
       * whether the callee built the value or handed back the caller's. That is
       * this table's one declared blind spot; see the note on the `in` half.
       */
      /** The innermost local binding of `name` in a function body, if any. */
      const localInitializerOf = (
        scope: ts.SignatureDeclaration,
        name: string,
      ): ts.Expression | undefined => {
        const body = (scope as { body?: ts.Node }).body;

        if (body === undefined) {
          return undefined;
        }

        let initializer: ts.Expression | undefined;

        const look = (n: ts.Node): void => {
          if (
            ts.isVariableDeclaration(n) &&
            n.initializer !== undefined &&
            boundNames(n.name, []).includes(name)
          ) {
            initializer ??= n.initializer;
          }

          ts.forEachChild(n, look);
        };

        look(body);

        return initializer;
      };

      const reachesParameter = (
        name: ts.Identifier,
        from: ts.Node,
        seen: Set<string>,
      ): boolean => {
        if (seen.has(name.text)) {
          return false;
        }

        seen.add(name.text);

        for (
          let scope: ts.Node | undefined = from;
          scope !== undefined;
          scope = scope.parent
        ) {
          if (!ts.isFunctionLike(scope)) {
            continue;
          }

          if (
            scope.parameters.some((parameter) =>
              boundNames(parameter.name, []).includes(name.text),
            )
          ) {
            return true;
          }

          const aliased = localInitializerOf(scope, name.text);

          if (aliased !== undefined) {
            const root = rootOf(aliased);

            return (
              root.kind === ts.SyntaxKind.ThisKeyword ||
              (ts.isIdentifier(root) && reachesParameter(root, scope, seen))
            );
          }
        }

        return false;
      };

      /**
       * An own-only check, on THIS loop's subject, in the first two statements of
       * a `for…in` body.
       *
       * ⚠ Read off the AST, not off the statement's text. `text.includes(subject)`
       * asked whether the subject's spelling appears ANYWHERE in the statement, so
       * an own-check on a DIFFERENT object exempted the loop whenever one name was
       * a substring of the other — `Object.hasOwn(otherDeps, key)` inside
       * `for (const key in deps)` reads as a guard (measured). The reverse cost the
       * same: a cast in the head made the spellings differ and a real guard stopped
       * counting.
       *
       * ⚑ The check must be on OWNNESS, which is what makes the loop `Object.keys`.
       * `Object.getOwnPropertyDescriptor(x, key)?.get` is NOT that check — it asks
       * whether the key is an own ACCESSOR, and an inherited key answers `undefined`
       * and falls straight through the body. That is precisely `guardDependencies`
       * (#1799), and it must keep being reported.
       */
      /**
       * The intrinsic a callee names — directly, or through a module-level
       * `const x = Object.<intrinsic>` binding in the same file.
       */
      const captureOf = (
        callee: ts.Expression,
        file: ts.SourceFile,
      ): "hasOwn" | "getOwnPropertyDescriptor" | undefined => {
        const named = (
          name: string,
        ): "hasOwn" | "getOwnPropertyDescriptor" | undefined =>
          name === "hasOwn" || name === "getOwnPropertyDescriptor"
            ? name
            : undefined;

        if (
          ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === "Object"
        ) {
          return named(callee.name.text);
        }

        if (!ts.isIdentifier(callee)) {
          return undefined;
        }

        for (const statement of file.statements) {
          if (!ts.isVariableStatement(statement)) {
            continue;
          }

          for (const declaration of statement.declarationList.declarations) {
            if (
              ts.isIdentifier(declaration.name) &&
              declaration.name.text === callee.text &&
              declaration.initializer !== undefined &&
              ts.isPropertyAccessExpression(declaration.initializer) &&
              ts.isIdentifier(declaration.initializer.expression) &&
              declaration.initializer.expression.text === "Object"
            ) {
              return named(declaration.initializer.name.text);
            }
          }
        }

        return undefined;
      };

      const guardsOwn = (
        body: ts.Statement,
        subject: string,
        key: string,
      ): boolean => {
        const statements = ts.isBlock(body) ? body.statements : [body];

        /** `Object.hasOwn(subject, key)` / a bare `Object.getOwnPropertyDescriptor(subject, key)`. */
        const isOwnFilter = (node: ts.Node): boolean => {
          if (!ts.isCallExpression(node)) {
            return false;
          }

          // ⚑ `Object.hasOwn(…)` OR a module-level CAPTURE of it. A guard that
          // is a security boundary binds the intrinsic once at load
          // (`const hasOwn = Object.hasOwn`) so an application cannot re-point
          // it after boot; insisting on the literal member access made this
          // scanner flag the guards that took the rule most seriously —
          // measured, capturing `hasOwn` in `SegmentMatcher.ts` did exactly
          // that to a legitimately own-guarded loop.
          const method = captureOf(node.expression, source);

          if (method === undefined) {
            return false;
          }

          // A descriptor whose FIELD is read tests something other than ownness;
          // only the descriptor's own existence is an own-only filter.
          if (
            method === "getOwnPropertyDescriptor" &&
            (ts.isPropertyAccessExpression(node.parent) ||
              ts.isElementAccessExpression(node.parent))
          ) {
            return false;
          }

          const first = node.arguments[0];
          const second = node.arguments[1];

          // ⚑ …asked about THIS loop's key. `Object.hasOwn(deps, "sentinel")`
          // is a constant, not a filter, and it exempted the loop.
          return (
            first !== undefined &&
            subjectOf(first).getText(source) === subject &&
            second !== undefined &&
            subjectOf(second).getText(source) === key
          );
        };

        /**
         * The expressions a statement DECIDES on. An own-check anywhere else
         * changes nothing: `const flag = Object.hasOwn(x, k);` with no branch,
         * the same call inside a nested arrow that is never invoked, inside a
         * dead `if (false)` block, or inside a template literal — each read as a
         * guard while the body ran on every inherited key (measured, all four).
         * The two-statement window stays: a filter that lets three statements
         * run first is not the head of the body.
         */
        const conditionsOf = (statement: ts.Statement): ts.Expression[] => {
          if (ts.isIfStatement(statement)) {
            return [statement.expression];
          }

          if (
            ts.isExpressionStatement(statement) &&
            ts.isBinaryExpression(statement.expression) &&
            (statement.expression.operatorToken.kind ===
              ts.SyntaxKind.AmpersandAmpersandToken ||
              statement.expression.operatorToken.kind ===
                ts.SyntaxKind.BarBarToken)
          ) {
            return [statement.expression.left];
          }

          return [];
        };

        return statements.slice(0, 2).some((statement) =>
          conditionsOf(statement).some((condition) => {
            let guarded = false;

            const look = (node: ts.Node): void => {
              // A check inside a nested function is not this loop's filter.
              if (node !== condition && ts.isFunctionLike(node)) {
                return;
              }

              guarded ||= isOwnFilter(node);

              ts.forEachChild(node, look);
            };

            look(condition);

            return guarded;
          }),
        );
      };

      /** The name a `for…in` head binds per iteration. */
      const keyNameOf = (statement: ts.ForInStatement): string => {
        const initializer = statement.initializer;
        const declared = ts.isVariableDeclarationList(initializer)
          ? initializer.declarations[0]?.name
          : initializer;

        if (declared !== undefined && ts.isIdentifier(declared)) {
          return declared.text;
        }

        throw new Error(
          `${relativePath}: a \`for…in\` head this scan cannot read — the key ` +
            "name is what an own-filter has to be asked about",
        );
      };

      const walk = (node: ts.Node): void => {
        if (
          ts.isForInStatement(node) &&
          !guardsOwn(
            node.statement,
            subjectOf(node.expression).getText(source),
            keyNameOf(node),
          )
        ) {
          found.push({ file: relativePath, shape: "for-in", code: head(node) });
        }

        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.InKeyword
        ) {
          const root = rootOf(node.right);

          if (
            root.kind !== ts.SyntaxKind.ThisKeyword &&
            !ts.isIdentifier(root)
          ) {
            // ⚠ A ternary or a call result names no binding this scan can
            // follow, so it cannot say whose object is walked. Silence would be
            // a verdict; this is not one.
            throw new Error(
              `${relativePath}: \`${head(node)}\` — an \`in\` subject this ` +
                `scan cannot root (${ts.SyntaxKind[root.kind]}). Bind it to a ` +
                "name, or classify it here.",
            );
          }

          if (
            root.kind === ts.SyntaxKind.ThisKeyword ||
            reachesParameter(root as ts.Identifier, node, new Set())
          ) {
            found.push({
              file: relativePath,
              shape: "in-on-param",
              code: head(node),
            });
          }
        }

        ts.forEachChild(node, walk);
      };

      walk(source);
    }

    return found;
  }

  it("every chain walk in src is classified", () => {
    const verdicts: Record<string, Site["shape"]> = {};

    for (const site of scan()) {
      // ⚠ Two sites with the same file AND the same first line are two sites.
      // `Object.fromEntries` collapsed them, so a second copy of an existing
      // walk was invisible — addressing by text is this file's rule, and the
      // ordinal is what keeps that rule from swallowing a duplicate.
      const base = `${site.file} · ${site.code}`;
      let key = base;
      let ordinal = 2;

      while (Object.hasOwn(verdicts, key)) {
        key = `${base} #${String(ordinal)}`;
        ordinal += 1;
      }

      verdicts[key] = site.shape;
    }

    expect(verdicts).toStrictEqual({
      // ── DEFECTS, each with an owner ──────────────────────────────────────

      // #1799 — the guard enumerates through the chain but tests own-only, so an
      // inherited getter passes and is then invoked by the copy loop below it.
      "guards.ts · for (const key in deps as Record<string, unknown>) {":
        "for-in",
      // #1799 — the copy loop, on both doors.
      "namespaces/DependenciesNamespace/dependenciesStore.ts · for (const key in initialDependencies) {":
        "for-in",
      "api/getDependenciesApi.ts · for (const key in deps) {": "for-in",
      // §8 — `recordsShallowEqual` counts OWN keys and then tests membership with
      // `in`, so two states with disjoint own `params` compare EQUAL. Publicly
      // reachable through `areStatesEqual(a, b, false)`.
      "namespaces/StateNamespace/StateNamespace.ts · key in right":
        "in-on-param",
      // ── EXEMPT, with the reason ──────────────────────────────────────────

      // Core's OWN bags, built a few lines earlier by the query parser and the
      // trie walk. Nothing the caller can reach through their prototype.
      "engine/path-matcher/SegmentMatcher.ts · for (const key in search) {":
        "for-in",
      "engine/path-matcher/SegmentMatcher.ts · for (const key in params) {":
        "for-in",
      // `paramsMatch`'s `source` LOOKS like the caller's bag and is not: every
      // `isActiveRoute` arc normalises before this runs. Verified by outcome —
      // an inherited `{ id: "X" }` against a committed `id: "7"` answers `true`,
      // which is the empty-bag answer, not the compared-and-equal one.
      "namespaces/RoutesNamespace/helpers.ts · for (const key in source) {":
        "for-in",
      // An `Error`'s `cause` lives on the prototype for a subclass; own-only would
      // be the bug here.
      'namespaces/NavigationNamespace/transition/errorHandling.ts · "cause" in thrown':
        "in-on-param",
      // `extendRouter`'s conflict check MUST see inherited members — the router's
      // methods are on its prototype, and that is exactly what it guards against.
      "api/getPluginApi.ts · key in router": "in-on-param",
      // A structural discriminator on a `State` core produced.
      'namespaces/RoutesNamespace/RoutesNamespace.ts · "name" in toState':
        "in-on-param",
      // `hasField` documents itself as answering for custom AND built-in
      // fields, and the built-ins live on the prototype — walking the chain is
      // the feature. Taken to its limit it also answers `true` for
      // `hasField("toString")`; that is the documented behaviour, not a
      // disagreement with a writer, since nothing pairs it with an own-only
      // write.
      "RouterError.ts · key in this": "in-on-param",
      // The six `RouteConfig` maps and both guard-factory records are
      // `Object.create(null)` — created that way BECAUSE these lines ask
      // `name in record` with a caller-supplied route name (#1801,
      // `createEmptyConfig` / `getFactories`). Null-prototype is what makes the
      // question own-only; a plain `{}` here restores the defect.
      "api/getRoutesApi.ts · lookupName in config.defaultParams": "in-on-param",
      "api/getRoutesApi.ts · lookupName in config.defaultSearch": "in-on-param",
      "api/getRoutesApi.ts · lookupName in config.decoders": "in-on-param",
      "api/getRoutesApi.ts · lookupName in config.encoders": "in-on-param",
      "api/getRoutesApi.ts · lookupName in canActivateFactories": "in-on-param",
      "api/getRoutesApi.ts · lookupName in canDeactivateFactories":
        "in-on-param",
      // The trie's `staticChildren` is `Object.create(null)` too
      // (`EMPTY_STATIC_CHILDREN`, and the copy-on-write branch in `trie.ts`),
      // and the key is a path segment the caller controls.
      "engine/path-matcher/SegmentMatcher.ts · lookupKey in node.staticChildren":
        "in-on-param",
      "engine/path-matcher/registration/trie.ts · key in node.staticChildren":
        "in-on-param",
      // `assertLoggerConfig` probes the CALLER's object, and the three names are
      // literals written here — none of them is an `Object.prototype` member, so
      // an inherited answer needs a caller who put it there. The read a line
      // later (`obj.level`) walks the same chain, so the probe and the consumer
      // cannot disagree — which is the only way this shape becomes a defect.
      'guards.ts · "level" in obj': "in-on-param",
      'guards.ts · "callback" in obj': "in-on-param",
      'guards.ts · "callbackIgnoresLevel" in obj': "in-on-param",
    });
  });

  it("CONTROL — the scanner finds both shapes, and finds them in src", () => {
    // ⚑ Non-vacuity with teeth: an empty result would satisfy `toStrictEqual({})`
    // if the table above were ever emptied in the same edit, and a scanner that
    // silently stopped parsing would report zero. Both shapes must be present,
    // and the file list must be non-trivial.
    const sites = scan();

    expect(sites.filter((s) => s.shape === "for-in").length).toBeGreaterThan(2);
    expect(
      sites.filter((s) => s.shape === "in-on-param").length,
    ).toBeGreaterThan(2);
    expect(new Set(sites.map((s) => s.file)).size).toBeGreaterThan(4);
  });
});
