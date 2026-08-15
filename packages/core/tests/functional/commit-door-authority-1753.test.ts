// #1753 / #1754 — CLASS guard: every door that COMMITS a state asks whether the
// state it is about to commit is still the right one, and the set of doors is
// DERIVED, never listed.
//
// The question has two strengths (see `CHECK_FORMS`): existence, and ownership,
// which subsumes it. Both are accepted where a door can only ask the weaker one,
// and the form is pinned PER DOOR so widening one and quietly reverting it reds.
//
// ⚠ SCOPE, stated first because the obvious reading is wrong. This walk finds
// CALLS to a commit primitive. It therefore does NOT see `navigateToState`'s
// existence check (`NavigationNamespace.ts`), which asks the same question one
// layer ABOVE its commit and reaches the pair through `completeTransition` —
// deleting that check leaves this file green, and `error-context.test.ts` is
// what covers it. Nor does it see `StateNamespace.clearCommitted()`, a write to
// the pair that takes no edge at all; the closed-set authority over WRITES is
// `committed-state-authority.test.ts`, whose own header says "nobody writes the
// cells" is false and always will be. This file's authority is narrower and
// exact: of the sites that CALL a commit primitive, every one that originates a
// state asks whether that state's route exists.
//
// The point is the third commit SITE. `completeTransition` has asked `hasRoute`
// for releases; the `replace()` revalidation shipped without it and committed a
// state for a route its own activation guard had just removed, cleanly, with a
// `TRANSITION_SUCCESS`. The
// pedigree is false completeness: #1201 put application code into that window,
// #1627 found one way it hurt, #1649 closed that one and left a comment stating
// that `replace()` "no longer executes anything of the caller's between the two
// points" — which the consult at `getRoutesApi.ts` contradicts to this day.
//
// ⚠ The tempting key — "asks `canSend(SYSTEM_COMMIT)`" — is WRONG, and it is
// the very reason the hole existed: that predicate answers "is the MACHINE
// somewhere a commit is legal" (#1186 / #1644), which is orthogonal to "does
// this route exist". Every door has it and one door was still broken. The key
// here is the CALL to a commit primitive.
//
// Two classes, both checked rather than assumed:
//
//   · PLUMBING — the DI layer (`src/wiring`, the facade's bag in `Router.ts`)
//     where these closures are DEFINED. It may only forward what it was handed,
//     so its arguments must be bare identifiers or a shorthand object of them.
//     A literal built there would be a door hiding in the wiring.
//   · DOORS — everywhere else. Each must ask `hasRoute` in the same function,
//     textually above the commit, or be EXEMPT with a reason.
//
// Direction is one-sided: `commits ⊆ asks ∪ exempt`. The exemptions are matched
// by STRICT equality, so a stale entry fails exactly like a missed door.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Namespace import — the canonical TS compiler-API form (typescript ships
// `export = ts`), matching `tree-mutator-guard-authority-1751.test.ts`.
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(__dirname, "../../src");

/**
 * The primitives that move the committed pair with a STATE in hand.
 * `systemCommit` rides the `SYSTEM_COMMIT` edge (the two commits that are not
 * transitions); `sendTransitionDone` / `sendComplete` ride `COMPLETE`.
 *
 * ⚠ NOT the complete set of pair writers, and saying so would be the same
 * over-claim this file exists to catch. `STOP` / `DISPOSE` shift and zero the
 * pair through their own edges, and `StateNamespace.clearCommitted()` writes it
 * with no edge at all. All three are excluded on a stated ground rather than
 * overlooked: none of them takes a state, so "does this route exist" has no
 * subject. `committed-state-authority.test.ts` is the closed-set guard over
 * writers; this one is the guard over the question asked before a commit.
 */
const COMMIT_PRIMITIVES = new Set([
  "systemCommit",
  "sendTransitionDone",
  "sendComplete",
]);

/**
 * The forms in which a door may ask "is the state I am about to commit still
 * the right one". TWO, because the question has two strengths and the doors
 * legitimately need different ones:
 *
 * · `hasRoute(name)` — EXISTENCE. All a door can ask when it holds a state it
 *   did not derive from a URL (`completeTransition` is handed a navigation's
 *   target; there is no URL to re-match that would not re-run the producer).
 * · `matcher.match(path)` — OWNERSHIP, and strictly stronger: a name the
 *   matcher hands back is a name it holds, so it subsumes existence. Available
 *   to a door whose state carries the URL it was built from (#1754).
 *
 * ⚠ Two entries, not one, and this is the honest reading rather than a
 * convenience: a door that CAN ask ownership and asks existence instead is a
 * silent downgrade, which is why `STRONGEST` below pins the form per door
 * rather than letting either satisfy every site.
 */
const CHECK_FORMS = {
  existence: "hasRoute",
  ownership: "match",
} as const;

/**
 * The form each door is required to use. Pinned by strict equality, so a door
 * downgrading from ownership to existence reds exactly like a door dropping the
 * check altogether.
 */
const STRONGEST = new Map<string, keyof typeof CHECK_FORMS>([
  ["api/getRoutesApi.ts", "ownership"],
  [
    "namespaces/NavigationNamespace/transition/completeTransition.ts",
    "existence",
  ],
]);

/**
 * Names of the functions CALLED inside `node`, before `limit`, at call sites
 * that are real `CallExpression`s — plus, one hop deep, the names called inside
 * any same-file function among them.
 *
 * ⚠ AST, not a substring search over the source text, and that is a measured
 * correction. The first version did `above.includes("hasRoute(")`, which
 * (a) matched the token inside a COMMENT — so widening this very door left the
 * old token in its explanation and the guard went green on prose while the call
 * was gone — and (b) after that was patched with a comment-stripping regex,
 * still matched the token inside a STRING LITERAL, which is the identical defect
 * one quote character away. The regex was also unsound in the other direction:
 * `//` inside a string and `/*` inside a line comment (both live in `src` today
 * — a bench name `navigate/*`, a route illustration `/x/*`, `includes("//")`)
 * made it delete real code and red a door that asks correctly.
 *
 * The one hop matters because the check is legitimately extracted: both arms of
 * `replace()`'s revalidation ask it through `urlOwner`, and a guard that only
 * looked at the calling function would demand the question be re-inlined.
 */
/** The called member's own name, for a property access or a bare identifier. */
const calleeName = (callee: ts.Expression): string | undefined => {
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }

  return ts.isIdentifier(callee) ? callee.text : undefined;
};

const calledNames = (
  node: ts.Node,
  source: ts.SourceFile,
  limit: number,
  helpers: ReadonlyMap<string, ts.Node>,
  depth = 1,
): Set<string> => {
  const names = new Set<string>();

  const visit = (current: ts.Node): void => {
    if (current.getStart(source) >= limit) {
      return;
    }

    if (ts.isCallExpression(current)) {
      const name = calleeName(current.expression);

      if (name !== undefined) {
        names.add(name);

        const helper = depth > 0 ? helpers.get(name) : undefined;

        if (helper) {
          for (const inner of calledNames(
            helper,
            source,
            Number.MAX_SAFE_INTEGER,
            helpers,
            depth - 1,
          )) {
            names.add(inner);
          }
        }
      }
    }

    ts.forEachChild(current, visit);
  };

  visit(node);

  return names;
};

/** Top-level function declarations of a file, by name — the one-hop targets. */
const fileHelpers = (source: ts.SourceFile): Map<string, ts.Node> => {
  const out = new Map<string, ts.Node>();

  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      statement.body
    ) {
      out.set(statement.name.text, statement.body);
    }
  }

  return out;
};

/**
 * Files whose commit calls are DI plumbing rather than doors: the closures are
 * defined here and immediately forward the caller's own state. Checked, not
 * trusted — see `forwards only what it was handed` below.
 */
const PLUMBING = new Set(["wiring/wireNamespaces.ts", "Router.ts"]);

/**
 * A door that legitimately asks nothing, with the reason it may.
 *
 * `navigateToNotFound` builds `UNKNOWN_ROUTE`, which is not a route and has no
 * entry to look up — asking here would refuse the one commit whose whole purpose
 * is "this URL belongs to no route". It is the fall-through the other doors
 * route TO, so a check here would make the refusal path unreachable.
 */
const EXEMPT = new Map([
  [
    "namespaces/NavigationNamespace/transition/navigateToNotFound.ts",
    "commits UNKNOWN_ROUTE, which is not a route to look up",
  ],
]);

const byName = (a: string, b: string): number => a.localeCompare(b);

const walkFiles = (directory: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }

  return out;
};

interface CommitSite {
  /** False when no function-like node encloses the call — see `collectAll`. */
  readonly scoped: boolean;
  readonly file: string;
  readonly primitive: string;
  readonly line: number;
  /** Check forms actually CALLED above the commit, in its enclosing function. */
  readonly asked: readonly (keyof typeof CHECK_FORMS)[];
  /** Source text of the call's first argument. */
  readonly firstArg: string;
}

/** Nearest enclosing function-like ancestor, or `undefined` at top level. */
const enclosingFunction = (node: ts.Node): ts.Node | undefined => {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      return current;
    }

    current = current.parent;
  }

  return undefined;
};

/** Every call to a commit primitive in `src`, with the scope that encloses it. */
const collectAll = (): CommitSite[] => {
  const sites: CommitSite[] = [];

  for (const file of walkFiles(SRC_DIR)) {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const relative = path.relative(SRC_DIR, file);
    const helpers = fileHelpers(source);

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        COMMIT_PRIMITIVES.has(node.expression.name.text)
      ) {
        const fn = enclosingFunction(node);
        // No enclosing function-like node means there is no scope to search, so
        // such a site fails CLOSED — a commit in a constructor, accessor or
        // static block is reported rather than searched against the whole file.
        const called = fn
          ? calledNames(fn, source, node.getStart(source), helpers)
          : new Set<string>();

        sites.push({
          scoped: fn !== undefined,
          asked: (
            Object.keys(CHECK_FORMS) as (keyof typeof CHECK_FORMS)[]
          ).filter((form) => called.has(CHECK_FORMS[form])),
          file: relative,
          primitive: node.expression.name.text,
          line:
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1,
          firstArg: node.arguments[0]?.getText(source) ?? "",
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return sites;
};

/**
 * Source text of the `const <name> = …` declaration for `identifier`, or `""`
 * when the file has none — which fails the exemption rather than passing it.
 */
const findStateDeclaration = (
  source: ts.SourceFile,
  identifier: string,
): string => {
  let found = "";

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier &&
      node.initializer
    ) {
      found = node.initializer.getText(source);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
};

const isPlumbing = (site: CommitSite): boolean =>
  PLUMBING.has(site.file.split(path.sep).join("/"));

const asKey = (site: CommitSite): string => site.file.split(path.sep).join("/");

describe("#1753/#1754: every commit door asks about the state it commits", () => {
  const sites = collectAll();

  it("the site set is PINNED, so a door cannot appear OR vanish unnoticed", () => {
    // `length >= N` is not a canary — it tolerates losing exactly the sites
    // that matter. Every one of the three primitive names is satisfiable by
    // PLUMBING alone, so a name-set assertion would stay green with both real
    // doors deleted. The set is therefore pinned exactly, in both directions.
    expect(
      sites
        .map((site) => `${asKey(site)} (${site.primitive})`)
        .toSorted(byName),
    ).toStrictEqual(
      [
        "Router.ts (systemCommit)",
        "wiring/wireNamespaces.ts (systemCommit)",
        "wiring/wireNamespaces.ts (sendComplete)",
        "namespaces/NavigationNamespace/transition/navigateToNotFound.ts (systemCommit)",
        "namespaces/NavigationNamespace/transition/completeTransition.ts (sendTransitionDone)",
        "api/getRoutesApi.ts (systemCommit)",
      ].toSorted(byName),
    );
  });

  it("at least one real DOOR exists — neither plumbing nor exempt", () => {
    // The assertion the pinned set cannot make on its own: if every site were
    // reclassified as plumbing, `offenders` below would be empty and the guard
    // would guard nothing while still looking exact.
    const doors = sites.filter(
      (site) => !isPlumbing(site) && !EXEMPT.has(asKey(site)),
    );

    expect(doors.length).toBeGreaterThan(0);
  });

  it("every DOOR asks the question above the commit, or is exempt with a reason", () => {
    const offenders = sites
      .filter((site) => !isPlumbing(site))
      .filter((site) => !EXEMPT.has(asKey(site)))
      .filter((site) => !site.scoped || site.asked.length === 0)
      .map((site) => `${site.file}:${site.line} (${site.primitive})`)
      .toSorted(byName);

    // A new door — a fourth place that commits a state — lands here until it
    // either asks the question or is exempted deliberately.
    expect(offenders).toStrictEqual([]);
  });

  it("each door asks the STRONGEST form available to it — no silent downgrade", () => {
    // `offenders` above accepts either form, which is right: the question is
    // "was it asked". This is the second half — "was it asked as well as it
    // could be". Without it, widening a door and then reverting the widening
    // would be invisible.
    const asked = sites
      .filter((site) => !isPlumbing(site) && !EXEMPT.has(asKey(site)))
      .map(
        (site) =>
          `${asKey(site)} → ${site.asked.toSorted(byName).join("+") || "NONE"}`,
      )
      .toSorted(byName);

    expect(asked).toStrictEqual(
      [...STRONGEST]
        .map(([file, form]) => `${file} → ${form}`)
        .toSorted(byName),
    );
  });

  it("PLUMBING forwards only what it was handed — no state is built there", () => {
    // The plumbing exclusion is checked, not assumed: these sites may pass a
    // bare identifier or a shorthand object of identifiers, nothing else. A
    // literal built in the wiring layer would be a door in disguise, and it
    // would inherit the exclusion without ever being reviewed as a door.
    const bareIdentifier = /^\w+$/;
    // Parsed rather than matched: a regex for "a shorthand object of
    // identifiers" needs nested quantifiers and backtracks super-linearly.
    const isShorthandObject = (text: string): boolean => {
      const inner = text.trim();

      if (!inner.startsWith("{") || !inner.endsWith("}")) {
        return false;
      }

      return inner
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .every((part) => bareIdentifier.test(part));
    };

    const offenders = sites
      .filter((site) => isPlumbing(site))
      .filter(
        (site) =>
          !bareIdentifier.test(site.firstArg) &&
          !isShorthandObject(site.firstArg),
      )
      .map((site) => `${site.file}:${site.line} → ${site.firstArg}`)
      .toSorted(byName);

    expect(offenders).toStrictEqual([]);
  });

  it("no exemption is stale — each named file still commits", () => {
    // Strict equality in both directions: an exemption whose site moved away
    // fails exactly like a missed door, so the list cannot rot into a
    // permanent hole.
    const committing = new Set(sites.map((site) => asKey(site)));
    const stale = [...EXEMPT.keys()]
      .filter((f) => !committing.has(f))
      .toSorted(byName);

    expect(stale).toStrictEqual([]);
  });

  it("the exempt door really commits a non-route — asserted at the CALL", () => {
    // ⚠ The obvious form of this test — `expect(text).toContain("UNKNOWN_ROUTE")`
    // — is vacuous: that string appears four times in the file, twice in the
    // docblock alone, so the exemption would survive the commit being rewritten
    // to a named route. What has to hold is a property of the ARGUMENT: the
    // state handed to the commit must be built with `name: UNKNOWN_ROUTE` and
    // must never be assigned another name.
    for (const file of EXEMPT.keys()) {
      const full = path.join(SRC_DIR, file);
      const source = ts.createSourceFile(
        full,
        readFileSync(full, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );

      const commits = sites.filter((site) => asKey(site) === file);

      expect(commits.length).toBeGreaterThan(0);

      for (const site of commits) {
        // Resolve the argument identifier to its declaration in this file and
        // require the literal name. A second commit of anything else reds.
        const declared = findStateDeclaration(source, site.firstArg);

        // Every `name:` in that literal must BE the constant — parsed, not
        // pattern-matched, because a negative lookahead after `\s*` backtracks
        // to zero width and reports a match on the very text it should accept.
        const names = [...declared.matchAll(/\bname:\s*([^,\n}]+)/g)].map(
          (hit) => hit[1].trim(),
        );

        expect(names.length).toBeGreaterThan(0);
        expect([...new Set(names)]).toStrictEqual(["constants.UNKNOWN_ROUTE"]);
      }
    }
  });
});
