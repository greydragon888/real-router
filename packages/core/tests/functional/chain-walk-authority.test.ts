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

  /**
   * ⚑ Takes an optional source list so the CONTROL below can hand it a
   * SYNTHETIC file. Without that seam the only available non-vacuity check was
   * "at least N unguarded walks still exist in src" — a threshold that DECREASES
   * every time someone fixes one, i.e. a guard that penalises progress and reds
   * on the correct change it is waiting for. #1840 took it from 6 to 4 and this
   * batch to 3, against a literal `> 2`.
   */
  /**
   * THE read path. `scan()` and its parse CONTROL both go through this, so the
   * control cannot pass while the scanner reads something else — the exact hole
   * the first version had, where the control re-globbed on its own and stayed
   * green with `scan()`'s glob broken.
   */
  function sourceFiles(): { readonly file: string; readonly text: string }[] {
    return globSync(`${SRC}/**/*.ts`).map((file) => ({
      file,
      text: readFileSync(file, "utf8"),
    }));
  }

  function scan(
    sources?: readonly { readonly file: string; readonly text: string }[],
  ): Site[] {
    const found: Site[] = [];
    const inputs = sources ?? sourceFiles();

    for (const { file, text } of inputs) {
      const source = ts.createSourceFile(
        file,
        text,
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
       * EVERY value `name` takes in a function's OWN body — the declaration's
       * initializer AND every later `name = …`.
       *
       * ⚠ "The first one the walk reaches" is not "the one the `in` reads".
       * Taking `initializer ??=` over a whole-subtree walk let a nested arrow's
       * `const target = String(key)` — a CALL, and this scan's declared blind
       * spot — stand in for the real `const target = bag` three lines down, and
       * the site vanished: measured, `key in target` reported ZERO sites with
       * the decoy present and one without it. Nested functions are skipped for
       * the reason `guardsOwn` skips them.
       *
       * ⚠ A DECLARATION is not the only way a name comes to hold the caller's
       * object. Reading `ts.isVariableDeclaration` alone made the hop a
       * STATEMENT KIND rather than a data flow: measured, `const obj = bag;
       * "K" in obj` reports the site and the byte-adjacent `let obj; obj = bag;
       * "K" in obj` reported ZERO — one statement break away from invisible,
       * which is the same shape as the alias hop this helper was added for.
       *
       * ⚑ All of them, not one: a name that holds the caller's object on ANY
       * path walks the caller's chain. Refusing to choose between them (the
       * previous throw) answered a question nobody asked — the question is
       * whether ANY source reaches a parameter, and `some` answers it without
       * a walk order.
       */
      const localSourcesOf = (
        scope: ts.SignatureDeclaration,
        name: string,
      ): ts.Expression[] => {
        const body = (scope as { body?: ts.Node }).body;

        if (body === undefined) {
          return [];
        }

        const sources: ts.Expression[] = [];

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
            sources.push(n.initializer);
          }

          if (
            ts.isBinaryExpression(n) &&
            n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(subjectOf(n.left)) &&
            (subjectOf(n.left) as ts.Identifier).text === name
          ) {
            sources.push(n.right);
          }

          ts.forEachChild(n, look);
        };

        look(body);

        return sources;
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

          const aliased = localSourcesOf(scope, name.text);

          if (aliased.length > 0) {
            return aliased.some((source) => {
              const root = rootOf(source);

              return (
                root.kind === ts.SyntaxKind.ThisKeyword ||
                (ts.isIdentifier(root) && reachesParameter(root, scope, seen))
              );
            });
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
        file: ts.SourceFile,
      ): string | undefined => {
        const initializer = declaration.initializer;

        if (initializer === undefined) {
          return undefined;
        }

        if (ts.isIdentifier(declaration.name)) {
          return declaration.name.text === name
            ? intrinsicMemberOf(initializer, "Object", file)
            : undefined;
        }

        // ⚑ `const { <intrinsic>: <name> } = Object` — the SAME capture, one
        // spelling over. Measured: `const { hasOwn } = Object` in
        // `SegmentMatcher.ts` made this file report a legitimately own-guarded
        // loop as a defect, which is the false positive the capture was taught
        // to avoid, reintroduced by the spelling.
        if (
          !ts.isObjectBindingPattern(declaration.name) ||
          !isIntrinsic(initializer, "Object", file)
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
       * Whether the FILE binds `name` as a value — anywhere, at any depth.
       *
       * ⚠ `Object` and `Reflect` are recognised by SPELLING, and a spelling is
       * only the intrinsic while nothing in the file binds it. Measured, with
       * `SegmentMatcher.ts`'s module-level `const hasOwn = Object.hasOwn` in
       * place: a local `const Object = { hasOwn: (b, k) => b[k] !== undefined }`
       * made a brand-new unguarded `for…in` read as own-guarded and it never
       * reached the table, while the same object under the name `Obj` is
       * reported. `Object["hasOwn"]` did it too. This is `shadowsCapture`'s
       * question asked one level up — that helper checks whether the CAPTURE's
       * name is rebound and then trusted the name `Object` unconditionally.
       *
       * ⚑ File-wide and conservative, exactly like `type-mirror-authority`'s
       * `bindsName`: no core file binds `Object`, `Reflect` or `globalThis`, so
       * the cost of the over-report is zero and its direction is loud.
       */
      const bindsValueName = (file: ts.SourceFile, name: string): boolean => {
        let bound = false;

        const declares = (declared: ts.Node | undefined): void => {
          if (declared === undefined) {
            return;
          }

          if (ts.isIdentifier(declared)) {
            bound ||= declared.text === name;

            return;
          }

          if (
            ts.isObjectBindingPattern(declared) ||
            ts.isArrayBindingPattern(declared)
          ) {
            bound ||= boundNames(declared, []).includes(name);
          }
        };

        const visit = (node: ts.Node): void => {
          if (
            ts.isVariableDeclaration(node) ||
            ts.isParameter(node) ||
            ts.isBindingElement(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isFunctionExpression(node) ||
            ts.isClassDeclaration(node) ||
            ts.isClassExpression(node) ||
            ts.isImportClause(node) ||
            ts.isNamespaceImport(node) ||
            ts.isImportSpecifier(node) ||
            ts.isModuleDeclaration(node) ||
            ts.isEnumDeclaration(node) ||
            ts.isImportEqualsDeclaration(node)
          ) {
            declares(node.name);
          }

          ts.forEachChild(node, visit);
        };

        visit(file);

        return bound;
      };

      /** `<object>.<m>` / `<object>["<m>"]` — the two spellings of one access. */
      const memberAccessOf = (
        expression: ts.Expression,
      ): { object: ts.Expression; member: string } | undefined => {
        if (ts.isPropertyAccessExpression(expression)) {
          return {
            object: subjectOf(expression.expression),
            member: expression.name.text,
          };
        }

        if (
          ts.isElementAccessExpression(expression) &&
          ts.isStringLiteralLike(expression.argumentExpression)
        ) {
          return {
            object: subjectOf(expression.expression),
            member: expression.argumentExpression.text,
          };
        }

        return undefined;
      };

      /** The GLOBAL `<name>` — bare, or reached through `globalThis`. */
      const isIntrinsic = (
        expression: ts.Expression,
        name: string,
        file: ts.SourceFile,
      ): boolean => {
        const bare = subjectOf(expression);

        if (ts.isIdentifier(bare)) {
          return bare.text === name && !bindsValueName(file, name);
        }

        const access = memberAccessOf(bare);

        return (
          access?.member === name &&
          ts.isIdentifier(access.object) &&
          access.object.text === "globalThis" &&
          !bindsValueName(file, "globalThis")
        );
      };

      /** The member named by `<intrinsic>.<m>` / `<intrinsic>["<m>"]`. */
      const intrinsicMemberOf = (
        expression: ts.Expression,
        intrinsic: string,
        file: ts.SourceFile,
      ): string | undefined => {
        const access = memberAccessOf(subjectOf(expression));

        return access !== undefined &&
          isIntrinsic(access.object, intrinsic, file)
          ? access.member
          : undefined;
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
        if (
          ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement)
        ) {
          return statement.name?.text === name;
        }

        return (
          ts.isVariableStatement(statement) &&
          statement.declarationList.declarations.some((declaration) =>
            boundNames(declaration.name, []).includes(name),
          )
        );
      };

      /** The names a `for` / `for…of` / `for…in` HEAD binds per iteration. */
      const headBinds = (scope: ts.Node, name: string): boolean => {
        if (
          !ts.isForStatement(scope) &&
          !ts.isForOfStatement(scope) &&
          !ts.isForInStatement(scope)
        ) {
          return false;
        }

        const initializer = scope.initializer;

        return (
          initializer !== undefined &&
          ts.isVariableDeclarationList(initializer) &&
          initializer.declarations.some((declaration) =>
            boundNames(declaration.name, []).includes(name),
          )
        );
      };

      /**
       * ⚠ The list of scopes that BIND is the predicate, and reading three of
       * the six was a spelling test wearing a binder's name — the very mistake
       * `shadowsCapture` exists to remove, reintroduced inside it. Measured in
       * `SegmentMatcher.ts`, which captures `hasOwn` at module level: a decoy
       * `hasOwn` bound by `for (const hasOwn of …)`, by `catch (hasOwn)`, or by
       * a `class hasOwn {}` statement each made an unguarded `for…in` read as
       * own-guarded and vanish from the table, while the identical decoy bound
       * by `const` is reported. Three spellings, one binder, opposite verdicts.
       */
      const scopeBinds = (scope: ts.Node, name: string): boolean => {
        if (ts.isFunctionLike(scope)) {
          return scope.parameters.some((parameter) =>
            boundNames(parameter.name, []).includes(name),
          );
        }

        if (ts.isCatchClause(scope)) {
          return (
            scope.variableDeclaration !== undefined &&
            boundNames(scope.variableDeclaration.name, []).includes(name)
          );
        }

        if (headBinds(scope, name)) {
          return true;
        }

        return (
          (ts.isBlock(scope) ||
            ts.isCaseClause(scope) ||
            ts.isDefaultClause(scope)) &&
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

        const direct = intrinsicMemberOf(callee, "Object", file);

        if (direct !== undefined) {
          return named(direct);
        }

        if (!ts.isIdentifier(callee) || shadowsCapture(callee.text, callee)) {
          return undefined;
        }

        for (const declaration of moduleDeclarations(file)) {
          const member = capturedMemberOf(declaration, callee.text, file);

          if (member !== undefined) {
            return named(member);
          }
        }

        return undefined;
      };

      /**
       * Does the first two statements of a `for…in` body carry an own-only
       * FILTER on THIS loop's subject and key — one that actually decides
       * whether the body runs?
       *
       * Three things have to hold together, and each was learned by a hole:
       * the call must be an own test (`Object.hasOwn`, or a bare
       * `getOwnPropertyDescriptor` whose EXISTENCE is the test — reading a
       * field off the descriptor asks about accessors, not ownness, which is
       * #1799); its arguments must be this loop's subject and this loop's key,
       * not a same-named shadow or a constant; and its POLARITY must match the
       * connective it sits under, since `own || …` lets the body run on an
       * inherited key while `!own && …` skips exactly one.
       */
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
         * The operands a condition decides through ONE connective, stopping at
         * the other one.
         *
         * ⚠ An own-check that is not on the spine does not decide anything —
         * `if (log(Object.hasOwn(x, k))) …` reads it as an argument, and a
         * descent into every node under the condition counted that.
         *
         * ⚑ …and the CONNECTIVE is half of the decision, not scenery. Walking
         * `&&` and `||` as one spine measured: `if (Object.hasOwn(bag, key) ||
         * key === "PROBE") { … }` runs the body on an inherited `PROBE`, and
         * `if (!Object.hasOwn(bag, key) && key === "PROBE") { continue; }` skips
         * only that one key and runs the body on every OTHER inherited key —
         * both were EXEMPT, and the same loops with no own-check anywhere are
         * reported. A positive filter is only a filter under `&&`; a negated one
         * only under `||`. A mixed condition is refused rather than read.
         */
        const operandsUnder = (
          condition: ts.Expression,
          operator: ts.SyntaxKind,
        ): ts.Expression[] => {
          const inner = subjectOf(condition);

          if (
            ts.isBinaryExpression(inner) &&
            inner.operatorToken.kind === operator
          ) {
            return [
              ...operandsUnder(inner.left, operator),
              ...operandsUnder(inner.right, operator),
            ];
          }

          return [inner];
        };

        /**
         * What a statement DECIDES on, and what a TRUE answer does to the key:
         * `skips` — the iteration moves on without it; `jumpsOut` — control
         * leaves the loop entirely.
         *
         * ⚑ Polarity is the whole question, and asking only "is an own-check in
         * a controlling position" does not ask it. Measured:
         * `if (Object.hasOwn(bag, key) && key === "__never__") { continue; }`
         * never continues, so every INHERITED key reached the copy below — and
         * the loop was exempt. The same loop with no own-check anywhere is
         * reported.
         *
         * ⚠ The two are NOT one flag, and collapsing them costs a live site.
         * A negated filter is sound whenever the branch leaves the iteration —
         * `continue`, `break`, and equally `return`/`throw`, which cannot run
         * the body on an inherited key at all; those two were REPORTED as
         * defects, the false positive that teaches the next reader to skim this
         * table. A POSITIVE filter is sound whenever the branch is not a skip —
         * and `registration/index.ts`'s `hasAnyParam` is exactly
         * `if (Object.hasOwn(map, key)) { return true; }`, own-only and
         * correct. One predicate for both polarities reports one of them.
         *
         * An own-check anywhere OTHER than a decision changes nothing:
         * `const flag = Object.hasOwn(x, k);` with no branch, the same call
         * inside a nested arrow that is never invoked, inside a dead
         * `if (false)` block, or inside a template literal — each read as a
         * guard while the body ran on every inherited key (measured, all four).
         * The two-statement window stays: a filter that lets three statements
         * run first is not the head of the body.
         */
        const decisionsOf = (
          statement: ts.Statement,
        ): {
          condition: ts.Expression;
          skips: boolean;
          jumpsOut: boolean;
        }[] => {
          if (ts.isIfStatement(statement)) {
            const branch = statement.thenStatement;
            const first = ts.isBlock(branch) ? branch.statements[0] : branch;
            const skips =
              first !== undefined &&
              (ts.isContinueStatement(first) || ts.isBreakStatement(first));

            return [
              {
                condition: statement.expression,
                skips,
                jumpsOut:
                  skips ||
                  (first !== undefined &&
                    (ts.isReturnStatement(first) ||
                      ts.isThrowStatement(first))),
              },
            ];
          }

          if (
            ts.isExpressionStatement(statement) &&
            ts.isBinaryExpression(statement.expression) &&
            (statement.expression.operatorToken.kind ===
              ts.SyntaxKind.AmpersandAmpersandToken ||
              statement.expression.operatorToken.kind ===
                ts.SyntaxKind.BarBarToken)
          ) {
            // `own && use(key)` runs the effect on a TRUE answer;
            // `!own || use(key)` runs it on a FALSE one, so a TRUE answer is
            // exactly the key being passed over.
            const passesOver =
              statement.expression.operatorToken.kind ===
              ts.SyntaxKind.BarBarToken;

            return [
              {
                condition: statement.expression.left,
                skips: passesOver,
                jumpsOut: passesOver,
              },
            ];
          }

          return [];
        };

        return statements.slice(0, 2).some((statement) =>
          decisionsOf(statement).some(({ condition, skips, jumpsOut }) =>
            [
              [true, ts.SyntaxKind.BarBarToken] as const,
              [false, ts.SyntaxKind.AmpersandAmpersandToken] as const,
            ].some(([wantNegated, operator]) => {
              // `!own` is a filter only where a TRUE answer leaves the
              // iteration; a bare `own` only where a TRUE answer does not skip
              // the key. The other two pairings run the body on exactly the
              // keys the rule excludes.
              if (wantNegated ? !jumpsOut : skips) {
                return false;
              }

              return operandsUnder(condition, operator).some((operand) => {
                // ⚠ Negation is a PARITY, not a flag: `!!own` peeled once left
                // a `!own` behind, which is not a call, so a legitimate — if
                // odd — double-negated filter was reported.
                let filter = operand;
                let negated = false;

                while (
                  ts.isPrefixUnaryExpression(filter) &&
                  filter.operator === ts.SyntaxKind.ExclamationToken
                ) {
                  negated = !negated;
                  filter = subjectOf(filter.operand);
                }

                return negated === wantNegated && isOwnFilter(filter);
              });
            }),
          ),
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
        file: ts.SourceFile,
      ): ts.Expression | undefined => {
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.InKeyword
        ) {
          return node.right;
        }

        // ⚠ Read through `intrinsicMemberOf`, not off `Reflect.has` spelled one
        // way. Keyed on the dotted form alone this scan reported ZERO sites for
        // `Reflect["has"](bag, key)` and for `globalThis.Reflect.has(bag, key)`
        // while the byte-identical `Reflect.has(bag, key)` reds — and those are
        // the exact two spellings the `Object` side of this file already reads,
        // so the asymmetry was a rename away from invisible.
        if (
          ts.isCallExpression(node) &&
          intrinsicMemberOf(node.expression, "Reflect", file) === "has" &&
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

        const membershipSubject = membershipSubjectOf(node, source);

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

      // ⚑ THREE ROWS REMOVED — #1799 / #1823 / #1816 are closed. The guard
      // enumerated through the chain and tested own-only, so an inherited getter
      // passed and became a dependency; both copy loops walked the chain and read
      // each key twice, so a key was admitted on one value and stored with
      // another. All three now walk the SAME captured `objectKeys` and read once,
      // so none of them is a `for…in` any more. This is the census working as
      // designed: the rows were written as DEFECTS WITH AN OWNER, and they leave
      // when the owner ships.
      //
      // ⚠ Rows shrinking is fine HERE, and that is deliberate: the non-vacuity
      // controls no longer count them. One asserts the detector on a synthetic
      // file, the other asserts the read path over `src`, so an empty table
      // reads as a clean codebase rather than as a blind scanner.
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

      // ⚠ TWO ROWS REMOVED HERE, and the exemption they carried was WRONG
      // (#1840). It read: "Core's OWN bags, built a few lines earlier by the
      // query parser and the trie walk. Nothing the caller can reach through
      // their prototype." Both halves are true and neither is the hazard: the
      // bags are indeed core's, and the caller's prototype is indeed irrelevant
      // — but the walk sees whatever the AMBIENT `Object.prototype` carries,
      // which any library doing `Object.prototype.foo = 1` puts there without
      // an attacker. Measured: a non-string threw `TypeError: value.includes is
      // not a function` straight out of `match()`, and a bad-percent string
      // unmatched EVERY dynamic URL. The exemption reasoned about the wrong
      // prototype, which is exactly why both sites survived to be found by a
      // sweep rather than by this table.
      //
      // Both loops are `hasOwn`-gated now, so `guardsOwn` no longer classifies
      // them and the rows are gone rather than re-labelled. The WRITE half of
      // the same class (`params[pc.name] = segment`) is a different
      // environmental precondition and is tracked in #1852.
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

  it("CONTROL — the scanner still detects both shapes, on a synthetic file", () => {
    // ⚑ This asserts the INSTRUMENT, not the defect population. The previous
    // form required "at least 3 unguarded for-ins survive in src", which went
    // down every time one was fixed and would have red on the next correct
    // change — a non-vacuity guard that fails on success is worse than none,
    // because the pressure is then to keep a defect alive.
    //
    // A synthetic file cannot be fixed away, so this control holds no matter how
    // clean `src` becomes. It also fails loudly on the rots a count cannot see:
    // renaming the module-level `hasOwn` capture, or teaching `guardsOwn` a
    // spelling that accepts a filter which decides nothing.
    const FILE = "__control__.ts";
    const sites = scan([
      {
        file: `${SRC}/${FILE}`,
        text: [
          // ⚑ Three DISTINCT subject names. `code` is `head(node)` — the first
          // line of the walk — so the subject is what tells the entries apart in
          // a failure diff. NOT load-bearing for the assertion itself:
          // `toStrictEqual` on an array reds on LENGTH, so a leaked `gatedBag`
          // entry is caught whatever it is called. Distinct names make the
          // failure readable — a smaller claim than this comment used to make.
          "export function forInShape(openBag: Record<string, unknown>): void {",
          "  for (const key in openBag) {",
          "    void openBag[key];",
          "  }",
          "}",
          "export function inOnParamShape(paramBag: object, k: string): boolean {",
          "  return k in paramBag;",
          "}",
          "export function guardedShape(gatedBag: Record<string, unknown>): void {",
          "  for (const key in gatedBag) {",
          "    if (!Object.hasOwn(gatedBag, key)) {",
          "      continue;",
          "    }",
          "    void gatedBag[key];",
          "  }",
          "}",
        ].join("\n"),
      },
    ]);

    // Assert the SET, not two counts plus a substring: a count that fires first
    // short-circuits everything after it, so the negative half never runs under
    // the mutation it exists for. One `toStrictEqual` cannot hide that.
    expect(sites).toStrictEqual([
      { file: FILE, shape: "for-in", code: "for (const key in openBag) {" },
      { file: FILE, shape: "in-on-param", code: "k in paramBag" },
      // `gatedBag` is absent, and THAT is the discriminating half — a scanner
      // that stops recognising the own-gate reports a third entry here.
    ]);
  });

  it("CONTROL — the scanner actually parses src", () => {
    // ⚑ Separate from the detector control, because they fail for different
    // reasons. This one catches a scanner that stopped READING: a file renamed
    // to `.mts`/`.tsx`, a directory moved out of `SRC`, a glob that matches
    // nothing.
    //
    // ⚠ It calls `sourceFiles()` — the function `scan()` itself defaults to —
    // rather than re-globbing. The first version pasted a SECOND copy of the
    // glob here, so breaking the glob inside `scan()` left this control green;
    // measured, and the commit message claiming otherwise was wrong (the
    // mutation had edited both copies at once). A control that re-implements
    // the thing it guards is guarding its own copy.
    //
    // Measured at 134 files on `origin/master` 594f7e1d0. A file count does NOT
    // shrink as defects are fixed — the property the count of unguarded walks
    // lacked.
    const sources = sourceFiles();

    expect(sources.length).toBeGreaterThan(50);
    // Matched is not read: a glob can hit while the file comes back empty.
    expect(sources.every((source) => source.text.length > 0)).toBe(true);
    // And a structurally permanent file is present, so a directory moved out of
    // `SRC` fails here rather than silently shrinking the census.
    expect(sources.map((source) => path.relative(SRC, source.file))).toContain(
      "guards.ts",
    );
  });
});
