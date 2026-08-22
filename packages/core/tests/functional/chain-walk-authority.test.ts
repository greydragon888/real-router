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
 * - **`key in obj`** — or `Reflect.has(obj, key)`, which the specification
 *   defines as the same [[HasProperty]] — on a value the function RECEIVED: a
 *   parameter, a member reached through one (`b.params`), a local bound to one
 *   (`const obj = config!`), or `this`. Paired with an
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
      /**
       * The local binding of `name` in a function's OWN body, if any.
       *
       * ⚠ "The first one the walk reaches" is not "the one the `in` reads".
       * Taking `initializer ??=` over a whole-subtree walk let a nested arrow's
       * `const target = String(key)` — a CALL, and this scan's declared blind
       * spot — stand in for the real `const target = bag` three lines down, and
       * the site vanished: measured, `key in target` reported ZERO sites with
       * the decoy present and one without it. Nested functions are skipped for
       * the reason `guardsOwn` skips them, and two bindings of one name in one
       * body are refused rather than guessed between.
       */
      const localInitializerOf = (
        scope: ts.SignatureDeclaration,
        name: string,
      ): ts.Expression | undefined => {
        const body = (scope as { body?: ts.Node }).body;

        if (body === undefined) {
          return undefined;
        }

        const initializers: ts.Expression[] = [];

        const look = (n: ts.Node): void => {
          // A nested function's local of this name is not this scope's binding.
          if (n !== body && ts.isFunctionLike(n)) {
            return;
          }

          if (
            ts.isVariableDeclaration(n) &&
            n.initializer !== undefined &&
            boundNames(n.name, []).includes(name)
          ) {
            initializers.push(n.initializer);
          }

          ts.forEachChild(n, look);
        };

        look(body);

        if (initializers.length > 1) {
          throw new Error(
            `${relativePath}: \`${name}\` is bound ${String(initializers.length)} times ` +
              "in one function body — this scan cannot say which binding the " +
              "`in` reads, and picking one is a walk order rather than a fact. " +
              "Rename one, or classify the site here.",
          );
        }

        return initializers[0];
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
      const moduleDeclarations = (
        file: ts.SourceFile,
      ): ts.VariableDeclaration[] =>
        file.statements.flatMap((statement) =>
          ts.isVariableStatement(statement)
            ? [...statement.declarationList.declarations]
            : [],
        );

      /**
       * The `Object` member a single module-level declaration binds to `name` —
       * `const <name> = Object.<i>` or `const { <i>: <name> } = Object`.
       */
      const capturedMemberOf = (
        declaration: ts.VariableDeclaration,
        name: string,
      ): string | undefined => {
        const initializer = declaration.initializer;

        if (initializer === undefined) {
          return undefined;
        }

        if (ts.isIdentifier(declaration.name)) {
          return declaration.name.text === name
            ? objectMemberOf(initializer)
            : undefined;
        }

        // ⚑ `const { <intrinsic>: <name> } = Object` — the SAME capture, one
        // spelling over. Measured: `const { hasOwn } = Object` in
        // `SegmentMatcher.ts` made this file report a legitimately own-guarded
        // loop as a defect, which is the false positive the capture was taught
        // to avoid, reintroduced by the spelling.
        if (
          !ts.isObjectBindingPattern(declaration.name) ||
          !isObjectItself(initializer)
        ) {
          return undefined;
        }

        for (const element of declaration.name.elements) {
          const source = element.propertyName ?? element.name;

          if (
            ts.isIdentifier(element.name) &&
            element.name.text === name &&
            (ts.isIdentifier(source) || ts.isStringLiteralLike(source))
          ) {
            return source.text;
          }
        }

        return undefined;
      };

      /**
       * The intrinsic a callee names — directly, or through a module-level
       * capture in the same file: `const x = Object.<i>`, `Object["<i>"]`,
       * `globalThis.Object.<i>`, or `const { <i>: x } = Object`.
       *
       * ⚠ **Declared limit**: exactly ONE hop, from a module-level statement.
       * A capture re-aliased (`const a = Object.hasOwn; const hasOwn = a;`) or
       * imported from another module is NOT resolved, and the loop it guards is
       * REPORTED rather than exempted. That is loud and wrong in the safe
       * direction — a maintainer sees a new table row and reads this note —
       * whereas resolving arbitrary chains without a type checker is the
       * spelling test this helper exists to stop being.
       */
      /** `Object` itself, spelled bare or through `globalThis`. */
      const isObjectItself = (expression: ts.Expression): boolean =>
        (ts.isIdentifier(expression) && expression.text === "Object") ||
        (ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          expression.expression.text === "globalThis" &&
          expression.name.text === "Object");

      /** The member named by `Object.<m>` / `Object["<m>"]`, either spelling. */
      const objectMemberOf = (
        expression: ts.Expression,
      ): string | undefined => {
        if (ts.isPropertyAccessExpression(expression)) {
          return isObjectItself(expression.expression)
            ? expression.name.text
            : undefined;
        }

        if (
          ts.isElementAccessExpression(expression) &&
          isObjectItself(expression.expression) &&
          ts.isStringLiteralLike(expression.argumentExpression)
        ) {
          return expression.argumentExpression.text;
        }

        return undefined;
      };

      /**
       * Whether `name` is BOUND AGAIN between the call site and the module.
       *
       * ⚠ Without this the capture is a SPELLING, not a binder — the mistake
       * this whole file was rewritten to remove, one helper further in.
       * Measured in `SegmentMatcher.ts`, which does capture `hasOwn` at module
       * level: a local `const hasOwn = (b, k) => b[k] !== undefined` inside a
       * new `for…in` made the loop read as own-guarded and it never reached the
       * table, while the identical decoy under a name the file does NOT capture
       * is reported. One binder apart, opposite verdicts.
       */
      const declaresName = (statement: ts.Statement, name: string): boolean => {
        if (ts.isFunctionDeclaration(statement)) {
          return statement.name?.text === name;
        }

        return (
          ts.isVariableStatement(statement) &&
          statement.declarationList.declarations.some((declaration) =>
            boundNames(declaration.name, []).includes(name),
          )
        );
      };

      const scopeBinds = (scope: ts.Node, name: string): boolean => {
        if (ts.isFunctionLike(scope)) {
          return scope.parameters.some((parameter) =>
            boundNames(parameter.name, []).includes(name),
          );
        }

        return (
          ts.isBlock(scope) &&
          scope.statements.some((statement) => declaresName(statement, name))
        );
      };

      const shadowsCapture = (name: string, from: ts.Node): boolean => {
        for (
          let scope: ts.Node | undefined = from;
          scope !== undefined && !ts.isSourceFile(scope);
          scope = scope.parent
        ) {
          if (scopeBinds(scope, name)) {
            return true;
          }
        }

        return false;
      };

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

        const direct = objectMemberOf(callee);

        if (direct !== undefined) {
          return named(direct);
        }

        if (!ts.isIdentifier(callee) || shadowsCapture(callee.text, callee)) {
          return undefined;
        }

        for (const declaration of moduleDeclarations(file)) {
          const member = capturedMemberOf(declaration, callee.text);

          if (member !== undefined) {
            return named(member);
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
         * The operands on a condition's top-level `&&` / `||` spine.
         *
         * ⚠ An own-check that is not ON the spine does not decide anything —
         * `if (log(Object.hasOwn(x, k))) …` reads it as an argument, and a
         * descent into every node under the condition counted that.
         */
        const spineOf = (condition: ts.Expression): ts.Expression[] => {
          const inner = subjectOf(condition);

          if (
            ts.isBinaryExpression(inner) &&
            (inner.operatorToken.kind ===
              ts.SyntaxKind.AmpersandAmpersandToken ||
              inner.operatorToken.kind === ts.SyntaxKind.BarBarToken)
          ) {
            return [...spineOf(inner.left), ...spineOf(inner.right)];
          }

          return [inner];
        };

        /**
         * Whether the branch this condition guards JUMPS OUT of the iteration.
         *
         * ⚑ Polarity is the whole question, and asking only "is an own-check in
         * a controlling position" does not ask it. Measured:
         * `if (Object.hasOwn(bag, key) && key === "__never__") { continue; }`
         * never continues, so every INHERITED key reached the copy below — and
         * the loop was exempt. The same loop with no own-check anywhere is
         * reported. A negated filter must skip; a positive one must not.
         */
        const skipsIteration = (statement: ts.Statement): boolean => {
          if (!ts.isIfStatement(statement)) {
            return false;
          }

          const branch = statement.thenStatement;
          const first = ts.isBlock(branch) ? branch.statements[0] : branch;

          return (
            first !== undefined &&
            (ts.isContinueStatement(first) || ts.isBreakStatement(first))
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

        return statements.slice(0, 2).some((statement) => {
          const skips = skipsIteration(statement);

          return conditionsOf(statement).some((condition) =>
            spineOf(condition).some((operand) => {
              const negated =
                ts.isPrefixUnaryExpression(operand) &&
                operand.operator === ts.SyntaxKind.ExclamationToken;
              const filter = negated ? subjectOf(operand.operand) : operand;

              // `!own` must be what SKIPS the key; a bare `own` must be what
              // lets the body run. The other two pairings run the body on
              // exactly the keys the rule excludes.
              return isOwnFilter(filter) && negated === skips;
            }),
          );
        });
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

      /**
       * The object a MEMBERSHIP test walks — `k in x`, or `Reflect.has(x, k)`.
       *
       * ⚑ `Reflect.has` is specified as the `in` operator: same [[HasProperty]],
       * same chain. Keyed on the `in` TOKEN alone, this scan reported ZERO sites
       * for `Reflect.has(bag, key)` on a parameter while the byte-identical
       * `key in bag` reds — a rename away from invisible.
       */
      const membershipSubjectOf = (
        node: ts.Node,
      ): ts.Expression | undefined => {
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.InKeyword
        ) {
          return node.right;
        }

        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "Reflect" &&
          node.expression.name.text === "has" &&
          node.arguments.length === 2
        ) {
          return node.arguments[0];
        }

        return undefined;
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

        const membershipSubject = membershipSubjectOf(node);

        if (membershipSubject !== undefined) {
          const root = rootOf(membershipSubject);

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
      // ── MEASURED, no owner yet ───────────────────────────────────────────
      // ⚠ Neither of these was exempt for the reason it used to carry, and both
      // reasons were refuted by running the code. They are not in the DEFECTS
      // block because neither has an issue; they are not in EXEMPT because
      // neither is.

      // `shouldUpdateNode`'s argument check — on a value the CALLER passes, not
      // on "a State core produced": the guard exists because core did not
      // produce it, and the JSDoc two lines up says validation happens in the
      // facade. Measured through the public `router.shouldUpdateNode("a")`:
      //     {}                        -> [router.shouldUpdateNode] toState must be valid State object
      //     Object.create({name:"a"}) -> TypeError: Cannot read properties of undefined (reading 'reload')
      // An INHERITED `name` walks past the guard and the named refusal becomes
      // an anonymous crash one line later — #1798's shape, one namespace over.
      'namespaces/RoutesNamespace/RoutesNamespace.ts · "name" in toState':
        "in-on-param",
      // `hasField`'s built-ins do NOT live on the prototype. Measured on
      // `new RouterError("ERR", { segment: "users" })`, every field its JSDoc
      // names — `code`, `message`, `segment`, plus `name` and `stack` — answers
      // `Object.hasOwn === true`. So the chain walk buys the documented feature
      // nothing; what it adds is `hasField("toString") === true`,
      // `hasField("hasField") === true` and `hasField("constructor") === true`,
      // against a JSDoc example that says `hasField("unknown") === false`.
      "RouterError.ts · key in this": "in-on-param",

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
