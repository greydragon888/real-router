// Every `State` is built in one of six places, and each either freezes itself
// or names who freezes it.
//
// The sibling of `committed-state-authority.test.ts`: that one locks WHO may
// write the committed pair, this one locks WHO may CREATE a state and who may
// freeze it. Both exist because the guarantee they protect is distributed by
// design — "deeply frozen" is not one call but a policy of "each object is
// frozen once, where it is created" (INVARIANTS "State immutability"), and a
// policy with five owners goes stale the moment a sixth appears quietly.
//
// It is a CLOSED-SET assertion, not an absence one, in both layers: SIX
// constructors across five files, and FIVE shell-freeze sites, each named with
// its reason. One more of either is a failure — not because it is wrong, but
// because it has to be argued for and written down here.
//
// ⚠ Both layers key on the TYPE for the ARGUMENT and on the resolved SYMBOL
// for the callee — never on a spelling of either. ⚑ The callee half only
// became true in stages: an enumeration of four spellings, then a walk over
// the DECLARATION's shape (which stopped at any `import`), then the symbol
// itself. Two literals remain by construction — `"Object"` and `"globalThis"`
// name globals that have no symbol to resolve — and a file that shadows
// `Object` is caught by `type-mirror-authority`'s `bindsName` instead. Each
// layer has also been wrong the other way once, and each has
// been wrong the other way once. The freeze layer counted `freezeStateShell`
// calls until #1826, while two of its five sites spell it `Object.freeze(x)` —
// so the assertion said "exactly two places" with four sites live, and a THIRD
// raw freeze planted on `getRoutesApi`'s revalidation pair passed the whole suite
// in the package. It resolves the argument's TYPE now, which costs a
// `ts.Program` (~0.5 s, once) and buys form-independence: swapping either site
// to the other spelling is behaviour-identical and leaves every cell green.
//
// ⚠ The constructor scan keys on the TYPE at an object LITERAL (`: State = {…}` /
// `{…} as State` / `{…} satisfies State`), never on property names. Both
// mistakes were made while this was written and both produced a confident wrong
// number (`fsm-as-state-owner-2026-07-31.md` §11.A6): filtering by property
// gave "exactly two" (shorthand `path,` is not a match) and then "exactly
// three" (the revalidation spread carries no channel names at all). Keying on
// the type alone gave "six" — because `as State<P> | undefined` in
// `StateNamespace.get` is a READ being narrowed, not a state being built.
// Requiring the operand to be an object literal is what separates the two.

import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");

/**
 * The six places a `State` comes into existence — across five files — and why
 * each is its own.
 *
 * - `pipeline/materialize.ts` — the pipeline's publication boundary; every
 *   ordinary producer (navigate / makeState / matchPath / buildPath's siblings)
 *   arrives here.
 * - `transition/navigateToNotFound.ts` — the handwritten `UNKNOWN_ROUTE`. It
 *   wraps a URL rather than building from an intent, so it has no channels to
 *   canonicalise and cannot go through the pipeline.
 * - `NavigationNamespace.ts` — the deliberately UNFROZEN writable shell the
 *   transition pipeline commits through, the same shape `materializePending`
 *   builds. The one state that is not frozen at its origin, by design.
 *   ⚠ Its literal is an ANNOTATED `const` on purpose: written as a bare
 *   `return { … }` it takes its type from the method's return annotation, and
 *   this scan keys on the type AT the literal — measured, the file drops out of
 *   the census entirely while the suite stays green (#1976).
 * - `api/getRoutesApi.ts` ×2 — the two spread-derived states of `replace()`'s
 *   revalidation (survivor and route-identity change).
 * - `EventBusNamespace.ts` — the fourth commit door's own copy of the state it
 *   is handed (#1792). `getInternals` is published, so `toState` can be a State
 *   someone else built, and the door commits its own copy of both channels
 *   rather than the caller's objects. It does NOT freeze: the FSM freezes the
 *   shell at the commit one step later, the same way the writable shell above
 *   is frozen later rather than at its origin.
 *
 * ⚠ That last one is not new work — the literal has been there since the door
 * started copying. It was INVISIBLE to this census until it was given a name
 * and a type, because the scan keys on the `State` type at an object literal
 * and this one was an unannotated property value inside a call. A construction
 * passed straight into a function is the blind spot of a type-keyed scan; if a
 * seventh ever appears that way, this is how it will hide.
 */
const EXPECTED_CONSTRUCTORS: Record<string, number> = {
  "pipeline/materialize.ts": 1,
  "namespaces/NavigationNamespace/transition/navigateToNotFound.ts": 1,
  "namespaces/NavigationNamespace/NavigationNamespace.ts": 1,
  "namespaces/EventBusNamespace/EventBusNamespace.ts": 1,
  "api/getRoutesApi.ts": 2,
};

/**
 * Every site that freezes a state SHELL — by whichever route — and why.
 *
 * - `helpers.ts` — `freezeStateShell`'s own body. The helper, not a policy
 *   decision of its own; it is here because the census counts the OPERATION and
 *   would otherwise have to name an exception for the one function whose whole
 *   job this is.
 * - `routerFSM.ts` — the commit `update` on the table, through the helper. It
 *   moved here from `StateNamespace.set` when the context took ownership
 *   (#1641); it did not multiply, and this pins that it stays one site.
 * - `pipeline/materialize.ts` — the publication boundary, through the helper,
 *   for every state that is not committed through the table (predicates,
 *   `makeState`, `matchPath`).
 * - `transition/completeTransition.ts` — RAW `Object.freeze`. Not an
 *   independent freezer: it completes the deferral `materializePending` opened,
 *   after OVERWRITING `transition` (which the state has carried since its
 *   construction, #1976). The one site whose reason is "someone else decided
 *   not to freeze this yet".
 * - `transition/navigateToNotFound.ts` — RAW `Object.freeze`. The hand-built
 *   `UNKNOWN_ROUTE`: it never passes through `materialize`, so it freezes what
 *   it built.
 *
 * ⚠ Two of the five use the RAW form, and counting `freezeStateShell` CALLS —
 * which is what this layer did until #1826 — sees neither. The assertion then
 * read "the shell freeze lives in exactly two places" while four sites existed,
 * and a THIRD raw freeze planted on a state the census says nobody freezes
 * (`getRoutesApi`'s revalidation pair) passed the whole suite in the package.
 * That is the same error the layer had already been corrected for once — it
 * used to compare a Set of FILE names while the promise was about call sites —
 * one step further out: counting the SPELLING two of the sites do not use.
 * So the scan below resolves the TYPE of what is being frozen, which is
 * form-independent, and pays a `ts.Program` for it (~0.5 s, once per file).
 */
const EXPECTED_SHELL_FREEZERS: Record<string, number> = {
  "helpers.ts": 1,
  "routerFSM.ts": 1,
  "pipeline/materialize.ts": 1,
  "namespaces/NavigationNamespace/transition/completeTransition.ts": 1,
  "namespaces/NavigationNamespace/transition/navigateToNotFound.ts": 1,
};

function tsFiles(directory: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }

  return out;
}

/** `State` or `State<…>` — the type node, however it is parameterised. */
function isStateTypeNode(node: ts.TypeNode | undefined): boolean {
  if (node === undefined || !ts.isTypeReferenceNode(node)) {
    return false;
  }

  return ts.isIdentifier(node.typeName) && node.typeName.text === "State";
}

/** 1-based lines where an object LITERAL is created AS a `State`. */
function parseForScan(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );
}

/**
 * The object LITERALS that construct a `State`, as nodes.
 *
 * ⚠ Nodes, not line numbers, and the two layers below both read THIS. Keyed by
 * line they collide: `params: {}` and `search: {}` sit on the same line as the
 * literal that contains them in a one-line fixture, so a second pass matching
 * `line ∈ constructorLines` counts three constructions where there is one. Real
 * source hides that — its literals span lines — so the collision is invisible
 * outside a control, which is exactly where it was caught.
 */
function stateConstructorNodes(
  source: ts.SourceFile,
): ts.ObjectLiteralExpression[] {
  const hits: ts.ObjectLiteralExpression[] = [];

  const visit = (node: ts.Node): void => {
    // `const s: State = { … }` — annotated declaration of a literal
    if (
      ts.isVariableDeclaration(node) &&
      isStateTypeNode(node.type) &&
      node.initializer !== undefined &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      hits.push(node.initializer);
    }

    // `{ … } as State` / `{ … } satisfies State` — the operand must be a
    // LITERAL; an `as State<P> | undefined` over a property read is a
    // narrowing, not a construction, and must not count.
    if (
      (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) &&
      isStateTypeNode(node.type) &&
      ts.isObjectLiteralExpression(node.expression)
    ) {
      hits.push(node.expression);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return hits;
}

function stateConstructors(file: string): number[] {
  const source = parseForScan(file);

  return stateConstructorNodes(source).map(
    (node) =>
      source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
  );
}

/**
 * The State constructors whose literal does NOT name `transition` ANYWHERE in
 * its subtree — the shape #1976 removed, and the one this layer keeps removed.
 *
 * "Anywhere in the subtree" and not "an own property", deliberately: the commit
 * door spreads the field in conditionally (`...(x !== undefined && { transition
 * })`), which is correct there and only there, and an own-property rule would
 * red it. The looser rule still fails a producer that omits the field outright,
 * which is the regression — measured, not assumed: deleting `transition` from
 * `pipeline/materialize.ts` reds this.
 */
function constructorsMissingTransition(file: string): number[] {
  const source = parseForScan(file);

  const namesTransition = (node: ts.Node): boolean => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "transition"
    ) {
      return true;
    }

    return ts.forEachChild(node, namesTransition) ?? false;
  };

  return stateConstructorNodes(source)
    .filter((node) => !namesTransition(node))
    .map(
      (node) =>
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    );
}

/**
 * Is this the type of a router `State`? Resolved through a type PARAMETER's
 * constraint, so `freezeStateShell<T extends State>`'s own body counts as
 * freezing a state rather than as freezing a `T`.
 */
function isStateType(type: ts.Type, checker: ts.TypeChecker): boolean {
  const resolved = type.isTypeParameter()
    ? (checker.getBaseConstraintOfType(type) ?? type)
    : type;

  return /^State\b/.test(checker.typeToString(resolved));
}

/**
 * Does this call freeze a state SHELL? Two spellings, one question — and the
 * question is about the ARGUMENT's type, never about which function was called:
 *
 * - `Object.freeze(x)` where `x` is a `State`. Catches the two raw sites, and
 *   ignores the other 27 bare-identifier freezes in `src` (arrays, `paramMeta`,
 *   cached errors, route objects) without naming any of them, because none of
 *   them is a `State`.
 * - `freezeStateShell(x)` — the helper. The call is what marks the site; the
 *   freeze itself happens one frame down in `helpers.ts`, counted there too and
 *   deliberately, so the census never has to name an exception.
 */
function isStateShellFreeze(
  node: ts.Node,
  checker: ts.TypeChecker,
): node is ts.CallExpression {
  if (!ts.isCallExpression(node) || node.arguments.length === 0) {
    return false;
  }

  const callee = node.expression;

  // ⚑ Resolved through a module-level CAPTURE, not matched on the spelling.
  // `Object.freeze` and `const freeze = Object.freeze; freeze(x)` are the same
  // operation, and the second is the form core's guards are moving to so an
  // application cannot re-point the intrinsic after boot. Measured before this
  // resolution: applying that capture in `helpers.ts` dropped its shell freeze
  // out of the census — and the fix a reader reaches for (deleting the entry)
  // then leaves a SECOND shell freeze through the captured binding invisible,
  // which is verbatim the leak this file exists to close (#1826).
  // ⚑ Resolve the CALLEE to the intrinsic it names — every spelling of it.
  //
  // ⚠ This file's header says both layers "key on the TYPE, never on a name or
  // a spelling". The argument side has always been true to that; the callee side
  // was not, and each round taught it exactly one more spelling. Measured on a
  // sixth shell freeze planted at `getRoutesApi`'s revalidation pair — the site
  // #1826 was validated on:
  //
  //     Object.freeze(state)                       counted
  //     const named = Object.freeze; named(state)  counted   (added by the previous round)
  //     Object["freeze"](state)                    INVISIBLE
  //     const { freeze } = Object; freeze(state)   INVISIBLE
  //     globalThis.Object.freeze(state)            INVISIBLE
  //     const a = Object.freeze; const b = a; b()  INVISIBLE
  //
  // Each invisible row is #1826 verbatim: the census says five and six exist.
  // The destructured form is the one `chain-walk-authority`'s `capturedMemberOf`
  // already resolves, with a docblock saying it was added BECAUSE that spelling
  // flipped a verdict — the doctrine existed one file over and was not wired
  // here. So this resolves through the SYMBOL rather than enumerating spellings:
  // a new one costs nothing because none is named.
  /** The member a `.x` / `["x"]` access names, if it is statically knowable. */
  const memberNameOf = (node: ts.Node): string | undefined => {
    if (ts.isPropertyAccessExpression(node)) {
      return node.name.text;
    }

    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      return node.argumentExpression.text;
    }

    return undefined;
  };

  /** Is this expression the `Object` intrinsic — bare or via `globalThis`? */
  const isObjectIntrinsic = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node)) {
      return node.text === "Object";
    }

    return (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "globalThis" &&
      node.name.text === "Object"
    );
  };

  /** `const { freeze } = Object` / `const { freeze: f } = Object`. */
  const isFreezeDestructure = (declaration: ts.Declaration): boolean => {
    if (
      !ts.isBindingElement(declaration) ||
      !ts.isObjectBindingPattern(declaration.parent) ||
      !ts.isVariableDeclaration(declaration.parent.parent)
    ) {
      return false;
    }

    const source = declaration.parent.parent.initializer;
    const property = declaration.propertyName ?? declaration.name;

    return (
      source !== undefined &&
      isObjectIntrinsic(source) &&
      ts.isIdentifier(property) &&
      property.text === "freeze"
    );
  };

  const namesObjectFreeze = (node: ts.Node, depth = 0): boolean => {
    if (depth > 4) {
      return false;
    }

    const member = memberNameOf(node);

    if (member !== undefined) {
      return (
        member === "freeze" &&
        isObjectIntrinsic((node as ts.PropertyAccessExpression).expression)
      );
    }

    if (!ts.isIdentifier(node)) {
      return false;
    }

    // ⚑ Resolve the ALIAS first. An imported binding's declaration is an
    // `ImportSpecifier` — neither a variable declaration nor a binding element —
    // so reading `declarations[0]` without this stopped dead at every module
    // boundary. Measured: `export const chill = Object.freeze` in one file,
    // imported and used in another, was INVISIBLE to this census while the
    // same-file capture was seen.
    //
    // ⚠ That is not a hypothetical spelling. This release captures intrinsics in
    // eleven files, twenty-three module-level bindings, all spelled
    // `const NAME = Object.member;` — and hoisting them into one shared module is
    // the ordinary next step of exactly that work. Measured on that refactor: six
    // live shell freezes in `src`, the census reporting four, the whole suite
    // green.
    //
    // The lesson this file keeps relearning: follow the SYMBOL, not the shape of
    // the node that happens to declare it.
    const symbol = checker.getSymbolAtLocation(node);
    const resolved =
      symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol;
    const declaration = resolved?.declarations?.[0];

    if (declaration === undefined) {
      return false;
    }

    // `const freeze = Object.freeze`, and a chain of such aliases.
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return namesObjectFreeze(declaration.initializer, depth + 1);
    }

    return isFreezeDestructure(declaration);
  };

  const isObjectFreeze = namesObjectFreeze(callee);

  // ⚑ The helper half resolves the SYMBOL too, so an import alias cannot hide it.
  // Measured before this: `import { freezeStateShell as shellFreeze }` was
  // INVISIBLE — a raw string comparison, in the file whose header says it never
  // matches on a spelling.
  const isHelper = ((): boolean => {
    if (!ts.isIdentifier(callee)) {
      return false;
    }

    const symbol = checker.getSymbolAtLocation(callee);
    const resolved =
      symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol;

    return resolved?.getName() === "freezeStateShell";
  })();

  if (!isObjectFreeze && !isHelper) {
    return false;
  }

  return isStateType(checker.getTypeAtLocation(node.arguments[0]), checker);
}

/** 1-based lines where a state SHELL is frozen, in either spelling. */
function stateShellFreezes(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): number[] {
  const hits: number[] = [];

  const visit = (node: ts.Node): void => {
    if (isStateShellFreeze(node, checker)) {
      hits.push(
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      );
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return hits;
}

/**
 * The package's own `src` as a typed program. Built once and memoised — a
 * checker is what makes this census form-independent, and it measures ~0.5 s
 * for the whole package, paid by this file alone.
 */
let cachedProgram: ts.Program | undefined;

function sourceProgram(): ts.Program {
  if (cachedProgram !== undefined) {
    return cachedProgram;
  }

  const configPath = path.resolve(__dirname, "../../tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configPath),
  );

  cachedProgram = ts.createProgram({
    rootNames: parsed.fileNames.filter((file) => file.startsWith(SRC_DIR)),
    options: { ...parsed.options, noEmit: true },
  });

  return cachedProgram;
}

/** Every `src` file's state-shell freezes, keyed by path relative to `src`. */
function shellFreezeCensus(): Record<string, number> {
  const program = sourceProgram();
  const checker = program.getTypeChecker();
  const found: Record<string, number> = {};

  for (const source of program.getSourceFiles()) {
    if (!source.fileName.startsWith(SRC_DIR)) {
      continue;
    }

    const count = stateShellFreezes(source, checker).length;

    if (count > 0) {
      found[path.relative(SRC_DIR, source.fileName)] = count;
    }
  }

  return found;
}

describe("State-freeze authority — six constructors, and each one accounted for", () => {
  it("the scan discriminates — a construction counts, a narrowing does not", () => {
    // Positive and negative control on the scan ITSELF, in one fixture, because
    // both of this scan's earlier wrong answers were wrong in the direction of
    // looking right. Without this the census below is a number with no meaning.
    //
    // ⚠ It calls `stateConstructors`, the SAME function the census uses. An
    // earlier version re-implemented the visitor inline against an in-memory
    // source — so it agreed with itself no matter what the real one did, and an
    // edit to the real one was covered by nothing. The fixture is written to a
    // temp file, outside `SRC_DIR`, so the census walk cannot see it.
    const fixture = path.join(
      mkdtempSync(path.join(tmpdir(), "state-freeze-scan-")),
      "fixture.ts",
    );

    writeFileSync(
      fixture,
      `
        declare const raw: unknown;
        const built: State = { name: "a", params: {}, search: {}, path: "/a" };
        const cast = { name: "b" } as State;
        const sat = { name: "c" } satisfies State;
        const read = raw as State<Params> | undefined;
        const other: NotAState = { name: "d" };
        door({ name: "e", params: {}, search: {}, path: "/e" });
      `,
      "utf8",
    );

    // `built` / `cast` / `sat` are constructions; `read` is a narrowed READ (the
    // false positive that once made this census say six), `other` is not a
    // State, and the bare call argument is the KNOWN blind spot — an unannotated
    // literal passed straight into a function, which is how the sixth
    // constructor hid for three commits. It is not counted, and that is the
    // limit this control exists to state out loud rather than let a reader
    // assume away.
    expect(stateConstructors(fixture)).toHaveLength(3);
  });

  it("exactly six constructors, across exactly the five named files", () => {
    const found: Record<string, number> = {};

    for (const file of tsFiles(SRC_DIR)) {
      const hits = stateConstructors(file);

      if (hits.length > 0) {
        found[path.relative(SRC_DIR, file)] = hits.length;
      }
    }

    expect(found).toStrictEqual(EXPECTED_CONSTRUCTORS);
    expect(Object.values(found).reduce((a, b) => a + b, 0)).toBe(6);
  });

  it("every State constructor names `transition` — none may omit it (#1976)", () => {
    // The census above counts constructors; this counts what is INSIDE them.
    // `materialize` used to build the pending target without `transition` and
    // cast the literal `as State<P, S>`, so a producer could omit a field its
    // own return type declares required and nothing structural noticed — the
    // suite only reds where a SURFACE is measured, and a seventh producer
    // reachable from no measured surface would ship silently.
    const missing: Record<string, number[]> = {};

    for (const file of tsFiles(SRC_DIR)) {
      const hits = constructorsMissingTransition(file);

      if (hits.length > 0) {
        missing[path.relative(SRC_DIR, file)] = hits;
      }
    }

    expect(missing).toStrictEqual({});

    // CONTROL — the scan discriminates, in both directions and on the same
    // fixture, because a rule that answers "none missing" is indistinguishable
    // from one that answers nothing at all.
    const fixture = path.join(
      mkdtempSync(path.join(tmpdir(), "state-transition-scan-")),
      "fixture.ts",
    );

    writeFileSync(
      fixture,
      `
        declare const meta: unknown;
        declare const src: State;
        const bad: State = { name: "a", params: {}, search: {}, path: "/a" };
        const good: State = { name: "b", params: {}, search: {}, path: "/b", transition: meta };
        const spread = { name: "c", ...(src.transition !== undefined && { transition: src.transition }) } as State;
        const notAConstructor = { transition: meta };
      `,
      "utf8",
    );

    // `bad` is the regression; `good` names it flat; `spread` names it only
    // inside a conditional spread — the commit door's shape, which must pass.
    // `notAConstructor` is not a State literal at all, so it is out of scope in
    // both directions and must not mask a miss by being counted as a hit.
    expect(constructorsMissingTransition(fixture)).toHaveLength(1);
    expect(stateConstructors(fixture)).toHaveLength(3);
  });

  it("the freeze scan discriminates — by what is frozen, not by what was called", () => {
    // The same control the constructor census carries, for the same reason: this
    // layer has now been wrong TWICE about its own subject (a Set of files while
    // the promise was about calls; then `freezeStateShell` calls while two of the
    // sites spell it `Object.freeze`), and both times the assertion looked right.
    // A census with no control is a number with no meaning.
    //
    // `noLib` + a local `Object` declaration keeps this program to one file —
    // loading lib.d.ts here would cost more than scanning the whole package.
    const fixture = path.join(
      mkdtempSync(path.join(tmpdir(), "state-freeze-scan-")),
      "fixture.ts",
    );

    writeFileSync(
      fixture,
      `
        declare const Object: { freeze<T>(o: T): T };
        interface State { name: string; path: string }
        interface Canonical { name: string; path: object }
        declare function freezeStateShell<T extends State>(x: T): T;

        declare const shell: State;
        declare const arr: readonly string[];
        declare const canonical: Canonical;
        declare const bag: { params: object };

        Object.freeze(shell);              // counts — raw form, a State
        freezeStateShell(shell);           // counts — helper form
        Object.freeze(arr);                // not a State
        Object.freeze(canonical);          // shaped like one, is not one
        Object.freeze(bag.params);         // a channel, not the shell
        Object.freeze({ name: "x" });      // a literal, not a State
      `,
      "utf8",
    );

    const program = ts.createProgram({
      rootNames: [fixture],
      options: { noLib: true, noResolve: true },
    });
    const source = program.getSourceFile(fixture)!;

    expect(stateShellFreezes(source, program.getTypeChecker())).toHaveLength(2);
  });

  it("a state shell is frozen in exactly five places, in either spelling", () => {
    // ⚠ Corrected twice. It compared a Set of FILE names while `INVARIANTS.md`
    // promised "exactly two call sites" — so a third call inside a named file
    // passed green. Counting calls fixed that and left the deeper one: it counted
    // `freezeStateShell`, the spelling two of the four sites do not use, so a
    // third RAW `Object.freeze` of a shell passed the whole suite in the package
    // (validated by planting one on `getRoutesApi`'s revalidation pair, #1826).
    // The subject is the OPERATION, so the scan resolves the argument's type.
    expect(
      shellFreezeCensus(),
      "one each, and a sixth anywhere has to be argued for in EXPECTED_SHELL_FREEZERS",
    ).toStrictEqual(EXPECTED_SHELL_FREEZERS);
  });

  it("exactly two constructors freeze their own output — measured, not spelled", () => {
    // Both sides are SCANNED, so this is a measurement rather than an assertion
    // over two constants: a file that both builds a State and freezes a shell is
    // one that freezes what it built.
    //
    // ⚠ This used to be spelled instead — `toContain("freezeStateShell(state)")`
    // for one and `toContain("Object.freeze(state)")` for the other — and those
    // two lines are precisely what made the SPELLING look load-bearing while the
    // census counted only one of them (#1826). Swapping either file to the other
    // spelling is behaviour-identical and now leaves this green, as it should.
    const constructors: Record<string, number> = {};

    for (const file of tsFiles(SRC_DIR)) {
      const hits = stateConstructors(file);

      if (hits.length > 0) {
        constructors[path.relative(SRC_DIR, file)] = hits.length;
      }
    }

    const freezers = shellFreezeCensus();

    expect(
      Object.keys(constructors)
        .filter((file) => file in freezers)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual([
      "namespaces/NavigationNamespace/transition/navigateToNotFound.ts",
      "pipeline/materialize.ts",
    ]);
  });

  it("the four that do NOT freeze their own output each name who does", () => {
    // ⚠ The count moved and the cell did not, which is the failure this file
    // exists to prevent one level up. It read "the two constructors that do NOT
    // freeze" while there were four: `getRoutesApi`'s pair used to be frozen by
    // the FSM in place, and stopped being when the commit door started copying
    // what it is handed. Nobody freezes them now — nobody needs to, because
    // nothing outside `commitRevalidated` ever sees them — but that is a reason,
    // and a reason has to be written down rather than inferred from a count.
    //
    // Prose only, deliberately: WHO freezes a state is measured by the census
    // above, and a claim that no scan can check is exactly what belongs in a
    // comment the next reader will find.
    const sourceOf = (file: string): string =>
      readFileSync(path.join(SRC_DIR, file), "utf8");

    expect(
      sourceOf("namespaces/NavigationNamespace/NavigationNamespace.ts"),
      "the writable shell names the deferral",
    ).toContain("materializePending"); // prose pin: both matches are comments

    expect(
      sourceOf("namespaces/EventBusNamespace/EventBusNamespace.ts"),
      "the commit door names the FSM as its freezer",
    ).toContain("The FSM freezes this object in place");

    expect(
      sourceOf("api/getRoutesApi.ts"),
      "the revalidation pair says why nothing freezes them",
    ).toContain("never published: the commit door copies");
  });
});
