// The URL plugins must answer one product question with one value.
//
// `browser-plugin`, `hash-plugin` and `navigation-plugin` all decide "does
// browser Back honour `canDeactivate`" and "what is the base path". Those two
// options describe ROUTER behaviour, not URL encoding, so the three plugins
// answer them identically or not at all. #1651 made that structural: the values
// live once, in `shared/browser-env/defaults.ts`, and each plugin spreads them.
//
// Why a guard on top of the move (the move alone is not enough):
//
//   the move protects against "forgot to fix it in the other two" — a single
//   object cannot drift. It does NOT protect against "fixed it here on
//   purpose": a local override after the spread, or a spread quietly replaced
//   by literals, restores exactly the arrangement #1651 removed. That
//   arrangement already cost users once — #524 flipped the default in
//   `navigation-plugin` alone on a premise measured false in #1645, and for a
//   year and a half two plugins' READMEs contradicted each other about the same
//   behaviour.
//
// Each plugin's own suite pins its own default (browser + hash:
// `deactivate-default-1645.test.ts`; navigation: "forceDeactivate default is
// false" in `navigate.test.ts`). Those go green together with a deliberate
// one-plugin change — the author edits the plugin and its test. Nothing below
// the repo level compares the three. This file is that comparison.
//
// What it does NOT pin: the values themselves. Flipping `forceDeactivate` in
// the shared object is a legitimate product decision and keeps this file green
// — the invariant is single-sourcing, not `false`.
//
// Runs in the repo-lints CI job via `node --test scripts/*.test.mjs` — picked
// up by glob, no wiring of its own. Reads through the TypeScript AST rather
// than by regex: `{ ...shared, k: v }` is order-sensitive (a later key wins),
// and a line-oriented parser cannot see that the override came after the
// spread, which is precisely the mutation this guard exists to catch.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = join(ROOT, "packages");
const SHARED = join(ROOT, "shared/browser-env/defaults.ts");
const SHARED_EXPORT = "sharedUrlPluginDefaults";

// The plugins that must be in the family. A scan that loses one of them has
// broken, not "found nothing" — an empty or short family would make every
// assertion below trivially true, and the scans in this area fail SILENTLY.
//
// Measured on this repo (`git grep -l defaultOptions -- <pathspec>`), because
// the folklore about it is wrong in both directions:
//
//   packages/<star>/src                 0 files   <- the trap
//   packages/<star>/src/<star>         15
//   packages/<star>/src/constants.ts    4
//   packages/browser-plugin/src         3         <- no wildcard: directory prefix
//   packages/browser-plugi<star>/src    0         <- one wildcard, and the prefix
//                                                    reading is gone
//
// So the cause is NOT "a star does not cross a slash" — without `:(glob)` it
// crosses freely (`packages/<star>constants.ts` matches 5 files). The cause is
// that a wildcard turns the pathspec from a directory PREFIX into a full-path
// match, and a pattern ending at `src` matches no file. Under `:(glob)` the
// star stops crossing `/` (that same pattern matches 0), and braces expand in
// NEITHER mode — `{a,b}-plugin` is a second silent zero.
//
// Every one of those zeros reads exactly like "no duplicates". This list is
// what makes such a failure loud instead.
const REQUIRED_MEMBERS = ["browser-plugin", "hash-plugin", "navigation-plugin"];

function parse(file) {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

/** `{ … } as const` → the object literal inside; a bare literal → itself. */
function objectLiteralOf(node) {
  const inner =
    node !== undefined && ts.isAsExpression(node) ? node.expression : node;

  return inner !== undefined && ts.isObjectLiteralExpression(inner)
    ? inner
    : undefined;
}

/** The initializer of `export const <name> = …`, or undefined. */
function exportedInitializer(source, name) {
  let found;

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = node.initializer;
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

/** The shared decision: key → source text of its value. */
function readSharedDefaults() {
  assert.ok(
    existsSync(SHARED),
    `${SHARED} is missing — the shared defaults moved, this guard has not (#1651)`,
  );

  const literal = objectLiteralOf(
    exportedInitializer(parse(SHARED), SHARED_EXPORT),
  );

  assert.ok(
    literal,
    `${SHARED_EXPORT} must be an object literal (optionally \`as const\`)`,
  );

  const defaults = new Map();

  for (const prop of literal.properties) {
    assert.ok(
      ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name),
      `${SHARED_EXPORT}: every entry must be a plain \`key: value\` pair`,
    );

    defaults.set(prop.name.text, prop.initializer.getText());
  }

  return defaults;
}

/**
 * A plugin's EFFECTIVE defaults — the object as JavaScript would build it.
 *
 * Properties are walked in source order, so a key written after the spread
 * overwrites the shared one and is recorded as `local`. That ordering IS the
 * finding: `{ ...shared, forceDeactivate: true }` and
 * `{ forceDeactivate: true, ...shared }` mean opposite things.
 */
function readPluginDefaults(pkg, sharedKeys) {
  const file = join(PACKAGES, pkg, "src/constants.ts");

  if (!existsSync(file)) {
    return undefined;
  }

  const source = parse(file);
  const declared = exportedInitializer(source, "defaultOptions");
  const literal = objectLiteralOf(declared);

  if (!literal) {
    // A package with no `defaultOptions` at all is simply not in the family.
    // A package that HAS one this parser cannot read is a different animal:
    // `Object.freeze({ … })`, `{ … } satisfies Required<…>`, a builder call.
    // Silently dropping it would let a plugin leave the guard by changing how
    // it writes the object, so say what actually happened instead.
    assert.ok(
      declared === undefined,
      `${file}: \`defaultOptions\` is declared in a form this guard cannot read ` +
        `(expected an object literal, optionally \`as const\`). Extend the parser — ` +
        `an unreadable form must not silently leave the family (#1651).`,
    );

    return undefined;
  }

  // A local `const sharedUrlPluginDefaults = …` would spread something that
  // merely LOOKS shared. Only an import binds the name to the one object.
  let importedFrom;

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.importClause?.namedBindings === undefined ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue;
    }

    for (const element of statement.importClause.namedBindings.elements) {
      if (element.name.text === SHARED_EXPORT) {
        importedFrom = statement.moduleSpecifier.getText().slice(1, -1);
      }
    }
  }

  const entries = new Map();

  for (const prop of literal.properties) {
    if (ts.isSpreadAssignment(prop)) {
      assert.ok(
        ts.isIdentifier(prop.expression) &&
          prop.expression.text === SHARED_EXPORT,
        `${pkg}: defaultOptions spreads \`${prop.expression.getText()}\` — the only ` +
          `spread this guard can reason about is ${SHARED_EXPORT}`,
      );

      for (const [key, value] of sharedKeys) {
        entries.set(key, { value, origin: "shared" });
      }

      continue;
    }

    assert.ok(
      ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name),
      `${pkg}: every defaultOptions entry must be a plain \`key: value\` pair or a spread`,
    );

    entries.set(prop.name.text, {
      value: prop.initializer.getText(),
      origin: "local",
    });
  }

  return { pkg, file, entries, importedFrom };
}

/** Every package whose defaults take part in the shared product decision. */
function readFamily() {
  const shared = readSharedDefaults();
  const family = [];

  for (const pkg of readdirSync(PACKAGES).sort()) {
    const plugin = readPluginDefaults(pkg, shared);

    if (plugin === undefined) {
      continue;
    }

    // Membership is by content, not by name: a plugin that carries its OWN
    // copy of a shared key (no spread) still belongs to the family — and is
    // exactly the regression this file must fail on, so it cannot be allowed
    // to opt out by not importing.
    const touchesSharedKeys = [...plugin.entries.keys()].some((key) =>
      shared.has(key),
    );

    if (touchesSharedKeys) {
      family.push(plugin);
    }
  }

  return { shared, family };
}

test("positive control: the shared object and the family both parse", () => {
  // Without this, a parser broken by a refactor returns an empty family, every
  // assertion below passes over nothing, and this file guards air.
  const { shared, family } = readFamily();

  assert.ok(
    shared.size > 0,
    `${SHARED_EXPORT} parsed to zero keys — the guard would be vacuous`,
  );

  const names = family.map((member) => member.pkg);

  for (const required of REQUIRED_MEMBERS) {
    assert.ok(
      names.includes(required),
      `${required} is not in the URL-defaults family (found: ${names.join(", ") || "none"}) — ` +
        `either it stopped sharing the decision, or this scan is broken`,
    );
  }
});

test("a repeated option carries the same value in every plugin that has it", () => {
  const { family } = readFamily();
  const seen = new Map();

  for (const member of family) {
    for (const [key, entry] of member.entries) {
      const previous = seen.get(key);

      if (previous === undefined) {
        seen.set(key, { value: entry.value, pkg: member.pkg });

        continue;
      }

      assert.strictEqual(
        entry.value,
        previous.value,
        `${key}: ${member.pkg} defaults to ${entry.value}, ${previous.pkg} to ${previous.value} — ` +
          `one product decision, two answers. This is the #524/#1645 shape.`,
      );
    }
  }
});

test("an option held by two plugins is READ from the shared object, never re-typed locally", () => {
  // Deliberately keyed on "repeated", not on "is a key of the shared object".
  // The narrower form is blind to the way the class comes BACK: two plugins
  // agreeing on a NEW option, each with its own literal, is the #524 shape
  // again — same values on the day it is written, two editable copies from the
  // day after. A repeated key that is not single-sourced fails here whether or
  // not the shared object knows about it yet.
  const { family } = readFamily();
  const holders = new Map();

  for (const member of family) {
    for (const key of member.entries.keys()) {
      holders.set(key, [...(holders.get(key) ?? []), member]);
    }
  }

  for (const [key, members] of holders) {
    if (members.length < 2) {
      // Genuinely one plugin's own knob (`hashPrefix`) — URL mechanics, not a
      // shared product decision. Nothing to compare.
      continue;
    }

    for (const member of members) {
      assert.strictEqual(
        member.entries.get(key).origin,
        "shared",
        `${member.file}: '${key}' is written locally, but ${members.length} plugins carry it ` +
          `(${members.map((m) => m.pkg).join(", ")}). Equal values today are not the invariant — ` +
          `a second editable copy is the defect, because the copies drift on the next edit. ` +
          `Move it into ${SHARED_EXPORT} (#1651).`,
      );
    }
  }
});

test("the spread resolves to the shared module, not a same-named local", () => {
  const { shared, family } = readFamily();

  for (const member of family) {
    const usesShared = [...shared.keys()].some(
      (key) => member.entries.get(key)?.origin === "shared",
    );

    if (!usesShared) {
      continue;
    }

    assert.ok(
      member.importedFrom !== undefined,
      `${member.file}: spreads ${SHARED_EXPORT} without importing it`,
    );

    assert.match(
      member.importedFrom,
      /^\.\/browser-env/,
      `${member.file}: ${SHARED_EXPORT} must come from the ./browser-env symlink, ` +
        `got '${member.importedFrom}'`,
    );
  }
});
