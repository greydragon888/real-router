// #1852 — CLASS guard: every write into a record core BUILDS, under a key core
// did not CHOOSE, goes through `putField`, and the set of sites is DERIVED,
// never listed.
//
// TWO arms, and they differ in what a finding costs a reader. Inside
// `packages/core/src` every site is CLASSIFIED against the table below. Outside
// it — every other package's `src` (#1901) — the rule is ABSOLUTE and the
// registry is empty, because core may hold no reasons for code it does not
// consume (#1838). The second arm is at the foot of this file.
//
// `target[key] = value` is `[[Set]]`, which walks the destination's prototype
// chain BEFORE storing. So when the chain carries that name, the write does not
// happen: an accessor with no setter THROWS, an accessor with a setter diverts
// the value into application code, and a non-writable data property drops it
// silently. `Object.prototype` is the chain in question for every plain `{}`,
// and an ordinary library extension puts things there — no attacker required.
//
// ⚠ The obvious key — "the key is `__proto__`" — is WRONG, and it is the reason
// five `UNSAFE_KEY` skips could ship and leave the class open. `__proto__` is
// merely the one name that is hazardous in a PRISTINE environment; the others
// become hazardous the moment an application defines them, and the names an
// application would define are the ones a route declares: `id`, `page`, `tab`.
// Measured before `putField`: an ambient `tab` accessor made `router.navigate`
// reject with `TypeError: Cannot set property tab of #<Object> which has only a
// getter`, from inside the channel normaliser.
//
// ⚠ The second tempting key — "build the destination with `Object.create(null)`"
// — is a real fix and is the EXPENSIVE one: V8 keeps a prototype-less object in
// dictionary mode, so the price is not on the write but on every later READ of
// the bag. `{ __proto__: null }` as a literal is no cheaper, and it also changes
// a PUBLISHED shape. The measured comparison lives in `putField`'s docblock and
// is deliberately not copied here, because a second copy of a measurement goes
// stale on its own schedule.
//
// Direction is one-sided: `writes ⊆ guarded ∪ exempt`. A `putField` where a
// plain store would do is not a fail-open and must not red. The exemptions are
// matched by STRICT equality, so a stale entry fails exactly like a missed site
// — which is what makes this table the CLASSIFICATION rather than a mute list.

import { globSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching `tree-mutator-guard-authority-1751.test.ts`.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");

/**
 * Every OTHER package's `src` (#1901). `packages/*` minus core — the glob does
 * not descend into a symlinked directory, so the three `shared/` aliases are
 * absent from it by construction and stay with their coverage owners (#1838).
 * `packages/angular/src/dom-utils` IS reached, because that one is a tracked
 * copy rather than a symlink, and it costs nothing: it scans clean.
 */
const PACKAGES_DIR = path.resolve(__dirname, "../../..");

function outsideCoreFiles(): string[] {
  return globSync(`${PACKAGES_DIR}/*/src/**/*.ts`).filter(
    (file) => !file.startsWith(`${SRC_DIR}${path.sep}`),
  );
}

function tsFiles(directory: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }

  return out;
}

const parse = (file: string, text?: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    text ?? readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

/**
 * A key the AUTHOR chose is not this class: the author can read the name and
 * see whether it collides. That covers a string literal (`o["ok"] = 1`), a
 * numeric index, and a template with no substitution.
 *
 * ⚠ It deliberately does NOT cover an identifier that happens to hold a
 * constant — `g[REGISTRY_GLOBAL_KEY] = registry` reads as author-chosen to a
 * human and as computed to a scanner, and resolving which is dataflow. Such a
 * site is EXEMPT with that reason written out, so the judgement is recorded
 * rather than inferred.
 */
function isAuthoredKey(argument: ts.Expression): boolean {
  return (
    ts.isStringLiteral(argument) ||
    ts.isNumericLiteral(argument) ||
    ts.isNoSubstitutionTemplateLiteral(argument)
  );
}

/**
 * `Object.assign(dst, src)` copies with `[[Set]]`, one key at a time, so it is
 * the SAME hazard written differently — and it is the form a census keyed on
 * `X[Y] = Z` cannot see. Measured: `Object.assign(params, childParams)` in the
 * matcher's junction walk, with an ambient setter under a route's own param
 * name, left the route MATCHING and `state.params` empty — the URL's parameter
 * gone, silently.
 *
 * ⚠ Its define-semantics siblings are deliberately NOT here, because they are
 * not the hazard: an object spread, a computed-key literal (`{ [k]: v }`,
 * `CreateDataPropertyOrThrow`), `Object.fromEntries` and `JSON.parse` all
 * DEFINE, so no inherited accessor is consulted.
 */
const SET_COPIER = "Object.assign";

/**
 * The five reasons a computed-key write is NOT this class, spelled once.
 *
 * ⚑ Every one was established by RUNNING the code — planting an accessor, a
 * getter+setter pair and a non-writable property on `Object.prototype` under the
 * name in question, and checking the observable result does not move — never by
 * reading the constructor of the destination.
 */
const NULL_PROTO =
  "the destination has NO prototype (`Object.create(null)`), so there is no chain to consult. " +
  "⚠ The commonest reason and the easiest to get wrong, because it is a claim about a line " +
  "somewhere else: validated by MUTATION, shimming `Object.create(null)` to `{}` for the " +
  "duration of one door (stack-scoped where two doors share a container) and watching it red. " +
  "Do not add an entry on this reason from the constructor's source alone.";

/**
 * ⚠ The half of this class core does NOT close, stated once so it is a LIMIT
 * rather than a silence.
 *
 * `Array.prototype.push` writes at `length`, an index the array never owns, so
 * it always consults the chain. There are ~100 such calls across the packages
 * and two are reachable from a public door, measured on bare core: with a
 * getter-only `Object.prototype["0"]`, `createRouter([...])` throws out of the
 * tree builder; with a getter+setter on the next index, `matchPath` of a
 * repeated query key either stops matching the route or substitutes the raw URL
 * chunk for the parsed value — silently, both ways.
 *
 * It is out of scope because the PRECONDITION is different in kind. Every site
 * `putField` closes is exposed by an ordinary library extension — a polyfill or
 * helper that defines `Object.prototype.id` / `.tab` / `.lang`, names an
 * application genuinely routes under. A numeric accessor on `Object.prototype`
 * is nobody's accident. Closing it would mean replacing every `push` with a
 * define, on paths including the trie builder and the query parser.
 *
 * ⚠ It was previously justified by "Node's own `console.log` throws first in
 * that environment, so the runtime is broken anyway". That is FALSE — measured,
 * `console.log` survives a getter on both `"0"` and `"1"`. The scanner does not
 * look for `push`, and this constant is the record of that being a decision.
 */
const ARRAY_OWN_INDEX =
  "an ARRAY at an index it ALREADY owns, so `[[Set]]` finds the own element and stops. " +
  "Controls both ways: a write to an existing index is not interceptable, `push` PAST the end " +
  "is — and that half is a stated LIMIT, see the docblock above.";

const OWN_ALREADY =
  "the key is already an OWN property of the very object being written — the walk is " +
  "`objectKeys(params)` over `params` itself. Measured with an ambient registrar: zero writes " +
  "reached the chain here, while the sibling capture above it reached one.";

const EXTEND_ROUTER =
  "already behind the SAME predicate: `extendRouter` asks `key in router` and throws " +
  "`PLUGIN_CONFLICT` above this line, so a name the chain answers for never reaches the write. " +
  "⚠ It degrades differently rather than not at all — an ambient key turns a legal " +
  "`extendRouter` into a spurious conflict. That is availability, and it belongs to that " +
  "method's own contract.";

const AUTHORED_FIELDS =
  "the target ALREADY OWNS every key being written: `store.config` is built by `createEmptyConfig()` " +
  "with all six `RouteConfig` fields present, so `[[Set]]` stops at the own property whatever the " +
  "chain carries. ⚠ This reason used to read 'author-chosen keys', which is true of the source and " +
  "is NOT what makes the site immune — demonstrated: `Object.assign({}, { decoders: 1 })` under a " +
  "non-writable `Object.prototype.decoders` THROWS, while the same call through `getRoutesApi().clear()` " +
  "does not. Ownership is the guarantee; authorship was a coincidence of the same site.";

const THE_PRIMITIVE =
  "the PRIMITIVE itself — the fast path `putField` takes once it has asked the chain and been " +
  "told no.";

/**
 * Why each REMAINING computed-key write is not this class.
 *
 * ⚑ The sites that WERE this class are absent by construction: they route through
 * `putField` / `copyFields` now, so they are CALLS rather than element assignments and this
 * scan cannot see them. What is left is the sweep's classification.
 *
 * ⚑ A write shared by two doors appears ONCE, under the file that owns it: the
 * dependency store's writer is `storeDependency`, and both the constructor door
 * and `setAll` reach the store through it, so this table classifies one site
 * rather than a copy per door (#2091).
 */
const REASONS: Record<string, string> = {
  "api/cloneRouter.ts · Object.assign(newStore.resolvedForwardMap, …)":
    NULL_PROTO,
  "api/cloneRouter.ts · Object.assign(newStore.routeCustomFields, …)":
    NULL_PROTO,
  "api/getDependenciesApi.ts · target[key] = dependencyValue": NULL_PROTO,
  "api/getPluginApi.ts · (router as Record<string, unknown>)[key] = values[index]":
    EXTEND_ROUTER,
  "engine/path-matcher/SegmentMatcher.ts · params[key] = decode(value)":
    OWN_ALREADY,
  'engine/path-matcher/buildParamMeta.ts · paramTypeMap[paramName] = "query"':
    NULL_PROTO,
  'engine/path-matcher/buildParamMeta.ts · paramTypeMap[token.name] = "url"':
    NULL_PROTO,
  'engine/path-matcher/parseSegment.ts · required[i] = segment.slice(0, segment.indexOf("?"))':
    ARRAY_OWN_INDEX,
  "engine/path-matcher/registration/index.ts · meta[segment.fullName] = segment.paramTypeMap":
    NULL_PROTO,
  "engine/path-matcher/registration/trie.ts · node.staticChildren[key] = createSegmentNode()":
    NULL_PROTO,
  "namespaces/DependenciesNamespace/dependenciesStore.ts · target[key] = value":
    NULL_PROTO,
  "namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts · activateRecord[name] = factory":
    NULL_PROTO,
  "namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts · activateRecord[name] = factory #2":
    NULL_PROTO,
  "namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts · deactivateRecord[name] = factory":
    NULL_PROTO,
  "namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts · deactivateRecord[name] = factory #2":
    NULL_PROTO,
  "namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts · defAct[name] = factory":
    NULL_PROTO,
  "namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts · defDeact[name] = factory":
    NULL_PROTO,
  "namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts · extensionAct[name] = factory":
    NULL_PROTO,
  "namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts · extensionDeact[name] = factory":
    NULL_PROTO,
  "namespaces/RoutesNamespace/helpers.ts · Object.assign(target[key], …)":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · Object.assign(objectCreate(null) as Record<string, Record<string, unknown>>, …)":
    NULL_PROTO,
  'namespaces/RoutesNamespace/routesStore.ts · Object.assign(objectCreate(null) as RouteConfig["forwardFnMap"], …)':
    NULL_PROTO,
  'namespaces/RoutesNamespace/routesStore.ts · Object.assign(objectCreate(null) as RouteConfig["forwardMap"], …)':
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · Object.assign(store.config, …)":
    AUTHORED_FIELDS,
  "namespaces/RoutesNamespace/routesStore.ts · Object.assign(store.config, …) #2":
    AUTHORED_FIELDS,
  "namespaces/RoutesNamespace/routesStore.ts · config.decoders[fullName] = (channels: ParamsSearch): ParamsSearch =>":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · config.defaultParams[fullName] = route.defaultParams":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · config.defaultSearch[fullName] = route.defaultSearch":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · config.encoders[fullName] = (channels: ParamsSearch): ParamsSearch =>":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · config.forwardFnMap[fullName] = route.forwardTo!":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · config.forwardMap[fullName] = route.forwardTo":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · forwardFnMap[name] = forwardTo":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · forwardMap[name] = forwardTo":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · map[fromRoute] = resolveForwardChain(fromRoute, config.forwardMap)":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · map[name] = value": NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · routeCustomFields[fullName] = customFields":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · store.config.decoders[name] = (channels: ParamsSearch): ParamsSearch =>":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · store.config.encoders[name] = (channels: ParamsSearch): ParamsSearch =>":
    NULL_PROTO,
  "namespaces/RoutesNamespace/routesStore.ts · store.routeCustomFields[name] = nextCustomFields":
    NULL_PROTO,
  "utils/fsm/fsm.ts · edges[event] = normalizeEdge(state, event, declaration)":
    NULL_PROTO,
  "utils/fsm/fsm.ts · out[state] = edges": NULL_PROTO,
  "utils/fsm/fsm.ts · this.#listeners[index] = null": ARRAY_OWN_INDEX,
  "utils/fsm/fsm.ts · this.#listeners[nullIndex] = listener": ARRAY_OWN_INDEX,
  "utils/ingest.ts · target[key] = value": THE_PRIMITIVE,
};

interface Site {
  readonly file: string;
  readonly code: string;
}

/**
 * Every write in `src` under a key the author did not spell out: `X[Y] = Z`,
 * plus `Object.assign`, which is the same `[[Set]]` per key.
 *
 * ⚠ Compound assignment to a computed member (`dst[k] ??= v`, `+=`, `++`),
 * destructuring into one, `Reflect.set`, and an ALIASED copier
 * (`const assign = Object.assign; assign(dst, src)`) are all the same hazard and
 * are all ABSENT from this corpus — verified by a scanner run against a
 * synthetic file carrying each. The alias is the one a reader is most likely to
 * assume is covered, because the plain form is. They are not detected here because adding a detector nothing
 * triggers is a control that cannot fail; the synthetic CONTROL below is what
 * keeps that decision honest, and the day one appears it belongs in this scan.
 */
function scan(files?: readonly { file: string; text: string }[]): Site[] {
  const sources = files
    ? files.map((f) => parse(f.file, f.text))
    : tsFiles(SRC_DIR).map((f) => parse(f));

  const found: Site[] = [];

  for (const source of sources) {
    const relative = path.relative(SRC_DIR, source.fileName);

    const visit = (node: ts.Node): void => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isElementAccessExpression(node.left) &&
        !isAuthoredKey(node.left.argumentExpression)
      ) {
        found.push({
          file: relative,
          // The first line only: several of these span a multi-line arrow body,
          // and the whole point of the key is that a human can read it in a diff.
          code: node.getText(source).split("\n", 1)[0].trim(),
        });
      }

      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === SET_COPIER
      ) {
        // The TARGET, not the first source line: these calls wrap across lines,
        // and the target is what decides the verdict anyway.
        found.push({
          file: relative,
          code: `${SET_COPIER}(${node.arguments[0]?.getText(source) ?? "?"}, …)`,
        });
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(source, visit);
  }

  return found;
}

// ============================================================================
// Outside core (#1901)
// ============================================================================

/**
 * Is this write inside a loop that walks ANOTHER bag? The gate `.semgrep/rules.yml`
 * puts on `unguarded-computed-key-write`, so the two agree on what a finding is.
 */
function insideBagWalk(node: ts.Node, source: ts.SourceFile): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isForInStatement(parent)) {
      return true;
    }

    if (
      ts.isForOfStatement(parent) &&
      /^(?:Object\.(?:entries|keys)|object(?:Entries|Keys))\s*\(/u.exec(
        parent.expression.getText(source),
      ) !== null
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Every spelling that names `Object.create` IN THIS FILE — the intrinsic and any
 * module-level capture of it (#2072).
 *
 * ⚑ Resolved through the BINDING rather than matched on `Object.create`, and
 * that is not a refinement: #2072 captured the intrinsic at fourteen files, so
 * the spelling this scanner keyed on stopped appearing at three sites it had
 * classified and one outside core — which reported them as unguarded writes onto
 * a live prototype. Same failure mode as #1826 one file over, where
 * `Object["freeze"]` and a destructured `freeze` were invisible to a census that
 * enumerated spellings.
 */
function objectCreateNames(source: ts.SourceFile): string[] {
  const names = [String.raw`Object\.create`];

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined &&
        ts.isPropertyAccessExpression(declaration.initializer) &&
        ts.isIdentifier(declaration.initializer.expression) &&
        declaration.initializer.expression.text === "Object" &&
        declaration.initializer.name.text === "create"
      ) {
        names.push(declaration.name.text);
      }
    }
  }

  return names;
}

/** Names this file declares as `Object.create(null)` — no chain to consult. */
function nullProtoLocals(source: ts.SourceFile): Set<string> {
  const found = new Set<string>();
  const creates = new RegExp(
    String.raw`(?:${objectCreateNames(source).join("|")})\(\s*null\s*\)`,
    "u",
  );

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      creates.exec(node.initializer.getText(source)) !== null
    ) {
      found.add(node.name.text);
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);

  return found;
}

function scanOutsideCore(
  files?: readonly { file: string; text: string }[],
): Site[] {
  const sources = files
    ? files.map((f) => parse(f.file, f.text))
    : outsideCoreFiles().map((f) => parse(f));

  const found: Site[] = [];

  for (const source of sources) {
    const nullProto = nullProtoLocals(source);
    const relative = path.relative(PACKAGES_DIR, source.fileName);

    const visit = (node: ts.Node): void => {
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isElementAccessExpression(node.left) &&
        ts.isIdentifier(node.left.argumentExpression) &&
        !nullProto.has(node.left.expression.getText(source)) &&
        insideBagWalk(node, source)
      ) {
        found.push({
          file: relative,
          code: node.getText(source).split("\n", 1)[0].trim(),
        });
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(source, visit);
  }

  return found;
}

describe("a write under a computed key is guarded or classified (#1852)", () => {
  it("every remaining computed-key write in src is classified", () => {
    const verdicts: Record<string, string> = {};

    for (const site of scan()) {
      // ⚠ Two sites with the same file AND the same text are two sites — the
      // ordinal is what keeps addressing-by-text from swallowing a duplicate,
      // the lesson `chain-walk-authority` learned from `Object.fromEntries`.
      const base = `${site.file} · ${site.code}`;
      let key = base;
      let ordinal = 2;

      while (Object.hasOwn(verdicts, key)) {
        key = `${base} #${String(ordinal)}`;
        ordinal += 1;
      }

      verdicts[key] = REASONS[key] ?? "UNCLASSIFIED";
    }

    // ⚑ Two directions in one assertion, deliberately. A site with no reason
    // reads `UNCLASSIFIED` and reds; a reason with no site is a key `toStrictEqual`
    // finds missing and also reds. The second half is what stops this table
    // becoming an archive of sites that were fixed years ago.
    expect(verdicts).toStrictEqual(REASONS);
  });

  it("CONTROL — the scanner sees both shapes, and the authored-key filter works", () => {
    // ⚑ Asserts the INSTRUMENT on a synthetic file, not the population. A count
    // over `src` would go DOWN every time a site is correctly closed, so it
    // would red on success — the anti-pattern `chain-walk-authority` documents.
    // A synthetic file cannot be fixed away.
    const FILE = "__control__.ts";

    expect(
      scan([
        {
          file: `${SRC_DIR}/${FILE}`,
          text: [
            "export function shapes(bag: Record<string, unknown>): void {",
            "  const out: Record<string, unknown> = {};",
            "  for (const k of Object.keys(bag)) {",
            "    out[k] = bag[k];",
            "  }",
            "  Object.assign(out, bag);",
            // Authored keys — must NOT be reported. A scanner that lost this
            // filter would bury the real sites under every `o[\"ok\"] = 1`.
            '  out["literal"] = 1;',
            "  out[0] = 2;",
            "  out[`tpl`] = 3;",
            "}",
          ].join("\n"),
        },
      ]),
    ).toStrictEqual([
      { file: FILE, code: "out[k] = bag[k]" },
      { file: FILE, code: "Object.assign(out, …)" },
    ]);
  });

  it("CONTROL — the table is not vacuous, and every reason is a known one", () => {
    // A `REASONS` emptied by accident would make the main cell assert
    // `{} === {}` over a `src` that had also stopped being scanned.
    //
    // ⚠ The bound used to be `toBeGreaterThanOrEqual(40)` against 45 entries,
    // which reds ON SUCCESS: correctly closing six more sites would fail it.
    // That is the anti-pattern the scanner CONTROL above exists to avoid, and it
    // had been reintroduced two cells later. A non-emptiness check cannot have a
    // magic ceiling.
    expect(scan().length).toBeGreaterThan(0);
    expect(scan()).toHaveLength(Object.keys(REASONS).length);

    // ⚑ The reason TEXT is never verified by this file, and that is worth
    // stating rather than implying: `verdicts[key] = REASONS[key] ?? …` compared
    // against `REASONS` is tautological on the value — what it pins is the SET
    // of sites. Demonstrated: turning a `NULL_PROTO` destination into a plain
    // `{}` makes two of these reasons FALSE and leaves this file green.
    //
    // What is checkable is that each reason is one of the six the file defines,
    // so a site cannot be waved through with prose written at the call site, and
    // that none of the six has fallen out of use — a constant nothing references
    // is a classification nobody is making any more.
    const known = [
      NULL_PROTO,
      ARRAY_OWN_INDEX,
      OWN_ALREADY,
      EXTEND_ROUTER,
      AUTHORED_FIELDS,
      THE_PRIMITIVE,
    ];

    const byText = (left: string, right: string): number =>
      left.localeCompare(right);

    expect([...new Set(Object.values(REASONS))].toSorted(byText)).toStrictEqual(
      known.toSorted(byText),
    );
  });
});

describe("outside core the same rule is ABSOLUTE (#1901)", () => {
  /**
   * `putField` / `copyFields` are published on `@real-router/core/utils` because
   * the rule is the plugin author's too, and thirteen sites across four plugins
   * already call them. What was missing is the assertion that they are called at
   * EVERY site: core's table above stops at `packages/core/src`, and the three
   * `shared/` mirrors (#1838) own only their own directories.
   *
   * ⚑ The detector here is NARROWER than the one above, and that is what lets
   * this arm live in core at all. The broad `dst[key] = …` form needs a reason
   * per site, and #1838 established that core must not hold reasons for code it
   * does not consume — *"rows in core's table that core reviewers cannot judge"*.
   * The semgrep rule's shape needs no reasons: a write inside a walk over another
   * bag, into a destination with a prototype, is a finding with no judgement
   * call. So the registry below is empty and stays empty — a site that needs a
   * reason belongs in its own package's suite, next to the reviewers who can
   * weigh it.
   *
   * The remedy the failure names is the one the semgrep rule already names:
   * `putField` / `copyFields`, or an `Object.create(null)` destination.
   */
  const EXEMPT: Record<string, string> = {};

  it("no package outside core writes a caller-derived key onto a live prototype", () => {
    const verdicts: Record<string, string> = {};

    for (const site of scanOutsideCore()) {
      verdicts[`${site.file} · ${site.code}`] = "UNCLASSIFIED";
    }

    expect(verdicts).toStrictEqual(EXEMPT);
  });

  it("CONTROL — the roots reach several packages, not one and not none", () => {
    // An empty scan satisfies the cell above, and an empty scan is what a broken
    // root produces. Counting FILES rather than sites, because a site count goes
    // down when someone is right.
    const files = outsideCoreFiles();

    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => !f.startsWith(`${SRC_DIR}${path.sep}`))).toBe(
      true,
    );

    const packages = new Set(
      files.map((f) => path.relative(PACKAGES_DIR, f).split(path.sep)[0]),
    );

    expect(packages.size).toBeGreaterThan(1);
    expect(packages.has("core")).toBe(false);
  });

  it("CONTROL — the detector fires, and each exclusion excludes", () => {
    // The instrument on a synthetic file: the population cannot be used, because
    // it is empty when the rule holds.
    const FILE = "__outside__.ts";
    const at = `${PACKAGES_DIR}/x/src/${FILE}`;
    const one = (body: string): Site[] =>
      scanOutsideCore([{ file: at, text: body }]);

    expect(
      one(
        [
          "export function copy(bag: Record<string, unknown>): void {",
          "  const out: Record<string, unknown> = {};",
          "  for (const k of Object.keys(bag)) {",
          "    out[k] = bag[k];",
          "  }",
          "}",
        ].join("\n"),
      ),
      "the shape itself",
    ).toStrictEqual([{ file: `x/src/${FILE}`, code: "out[k] = bag[k]" }]);

    expect(
      one(
        [
          "export function copy(bag: Record<string, unknown>): void {",
          "  const out: Record<string, unknown> = Object.create(null);",
          "  for (const k of Object.keys(bag)) {",
          "    out[k] = bag[k];",
          "  }",
          "}",
        ].join("\n"),
      ),
      "a null-prototype destination has no chain to consult",
    ).toStrictEqual([]);

    expect(
      one(
        [
          "const objectCreate = Object.create;",
          "export function copy(bag: Record<string, unknown>): void {",
          "  const out: Record<string, unknown> = objectCreate(null);",
          "  for (const k of Object.keys(bag)) {",
          "    out[k] = bag[k];",
          "  }",
          "}",
        ].join("\n"),
      ),
      "…and it is still prototype-less through a module-load CAPTURE (#2072)",
    ).toStrictEqual([]);

    expect(
      one(
        [
          "const objectCreate = (): Record<string, unknown> => ({});",
          "export function copy(bag: Record<string, unknown>): void {",
          "  const out: Record<string, unknown> = objectCreate();",
          "  for (const k of Object.keys(bag)) {",
          "    out[k] = bag[k];",
          "  }",
          "}",
        ].join("\n"),
      ),
      "CONTROL — a local named like the capture but NOT bound to Object.create still reds",
    ).toStrictEqual([{ file: `x/src/${FILE}`, code: "out[k] = bag[k]" }]);

    expect(
      one(
        [
          "export function put(out: Record<string, unknown>, k: string): void {",
          "  out[k] = 1;",
          "}",
        ].join("\n"),
      ),
      "a lone write is a map store, not a copy of someone's bag",
    ).toStrictEqual([]);

    expect(
      one(
        [
          "export function copy(bag: Record<string, unknown>): void {",
          "  const out: Record<string, unknown> = {};",
          "  for (const k of Object.keys(bag)) {",
          '    out["literal"] = bag[k];',
          "  }",
          "}",
        ].join("\n"),
      ),
      "an authored key is the author naming a field",
    ).toStrictEqual([]);
  });
});
