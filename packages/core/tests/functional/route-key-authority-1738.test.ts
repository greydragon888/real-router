// The route-field classification has ONE authority, and it is the `Route` type.
//
// `STANDARD_ROUTE_KEYS` splits a route definition into core's structural config
// and the plugin-defined **custom fields** exposed through
// `getPluginApi(router).getRouteConfig(name)`. Its own doc comment calls it "the
// single source of truth for the custom-field split" — but it is a hand-written
// list of strings, and the type it is supposed to mirror lives elsewhere. Nothing
// bound the two, so `defaultSearch` was declared on `Route` by RFC-4 M2 (#1548)
// and never reached the set: across 33 core releases a core config field was stored in
// the plugin bag, and on `update` a `defaultSearch` GETTER was read twice — once
// by the structural destructuring, once by the custom-field pass — landing two
// DIFFERENT values in the two homes.
//
// The test that was supposed to catch it could not: it built its route from the
// same hand-list as the set itself, so a field missing from both was invisible to
// it. Hence this file derives the key set from the TYPE and drives the behaviour
// from that, in two directions:
//
// 1. every field `Route` / `RouteConfigUpdate` DECLARES is classified as
//    structural — with a fixture-coverage assertion, so a newly declared field
//    cannot skip the check by simply having no test data;
// 2. every member of `STANDARD_ROUTE_KEYS` IS declared on `Route` — a phantom
//    entry would silently swallow a plugin's custom field of that name.
//
// Direction 1 is behavioural and needs no scan of the runtime set; direction 2
// cannot be observed through the public API at all (a route never carries a key
// that does not exist), so it reads both declarations from `src`.
import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type {
  ParamsSearch,
  Route,
  RouteConfigUpdate,
} from "@real-router/core/types";

const SRC_DIR = path.resolve(__dirname, "../../src");
const TYPES_FILE = path.join(SRC_DIR, "types/router.ts");
const CONSTANTS_FILE = path.join(
  SRC_DIR,
  "namespaces/RoutesNamespace/constants.ts",
);

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    // `false` deliberately: nothing here reads `.parent` / `.getStart()` / a
    // position, so parent pointers are allocation for the whole file per parse.
    // The sibling `committed-state-authority.test.ts` passes `true` because it
    // reports line numbers — copy the idiom only with its reason.
    /* setParentNodes */ false,
    ts.ScriptKind.TS,
  );
}

/**
 * The property names an interface DECLARES lexically in core's own source.
 *
 * ⚠ Lexically, and that is the load-bearing part: both interfaces are augmentable
 * (`Route` carries an index signature, `RouteConfigUpdate` is extended by plugins
 * through declaration merging), so a plugin's `onEnter` / `preload` /
 * `searchSchema` is a declared member of the merged type — and must NOT be a
 * standard key. Core's own declaration is exactly the set of fields core owns.
 *
 * ⚠ **The walk must not SKIP a form it does not understand — it must fail.** The
 * first version keyed on `isPropertySignature(m) && isIdentifier(m.name)` and
 * therefore could not see a field declared as `"defaultSearch"?: SearchParams` (a
 * quoted name) or as a method signature: measured on
 * `interface Route { name; path; "quotedField"?; methodField(): void; plainField? }`
 * it returned `["name","path","plainField"]` — i.e. #1738 could recur with this
 * file GREEN, and no non-vacuity threshold helps, because a partial list is not an
 * empty one. So the index signature is skipped EXPLICITLY (it declares no field),
 * every named member is collected whatever its form, and anything else throws.
 * Same reason for the `found` check: a renamed or moved interface must name itself
 * in the failure rather than silently reduce the expectation to nothing.
 */
function declaredMembers(file: string, interfaceName: string): string[] {
  const source = parse(file);
  const names: string[] = [];
  let found = false;

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) {
      found = true;

      for (const member of node.members) {
        if (ts.isIndexSignatureDeclaration(member)) {
          continue;
        }

        const name: ts.PropertyName | undefined = member.name;

        if (
          name !== undefined &&
          (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
        ) {
          names.push(name.text);
        } else {
          throw new Error(
            `${interfaceName}: member #${String(node.members.indexOf(member))} is a ` +
              `${ts.SyntaxKind[member.kind]} this walk cannot classify — decide ` +
              `whether it is a declared field before trusting this guard`,
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  if (!found) {
    throw new Error(
      `interface ${interfaceName} not found in ${file} — the guard's anchor moved`,
    );
  }

  return names;
}

/** The string literals in the `STANDARD_ROUTE_KEYS` initializer. */
function standardRouteKeys(): string[] {
  const source = parse(CONSTANTS_FILE);
  const keys: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "STANDARD_ROUTE_KEYS"
    ) {
      const literals = (initializer: ts.Node): void => {
        if (ts.isStringLiteralLike(initializer)) {
          keys.push(initializer.text);
        }

        ts.forEachChild(initializer, literals);
      };

      if (node.initializer) {
        literals(node.initializer);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return keys;
}

/**
 * One legal value per field `Route` declares — the test data direction 1 needs.
 *
 * A field declared on `Route` with no entry here fails the coverage assertion
 * below, which is what stops the next `defaultSearch` from being added to the
 * type and quietly skipping this file.
 */
const ROUTE_FIXTURE = {
  name: "auth",
  path: "/auth/:id?page",
  children: [{ name: "kid", path: "/kid" }],
  canActivate: () => () => true,
  canDeactivate: () => () => true,
  forwardTo: "auth.kid",
  encodeParams: (channels: unknown) => channels,
  decodeParams: (channels: unknown) => channels,
  defaultParams: { id: "1" },
  defaultSearch: { page: "1" },
};
// ⚠ No `satisfies` clause here, and its absence is measured rather than an
// omission: `Route` carries `[key: string]: unknown`, so BOTH
// `satisfies Record<string, unknown>` (which the first version had) and
// `satisfies Partial<Route>` are vacuous — every string-keyed literal passes them.
// The clause read like it bound the fixture to the type and bound nothing.
// `UPDATE_FIXTURE` below is the opposite case: `RouteConfigUpdate` is closed, so
// there the clause has teeth and is kept.

/**
 * One legal patch value per field `RouteConfigUpdate` declares. Identity fields
 * (`name` / `path` / `children`) are deliberately absent from that interface —
 * they are not patchable — so this table is derived against it, not against
 * `Route`, and needs no subtraction.
 */
const UPDATE_FIXTURE = {
  forwardTo: "auth.kid",
  defaultParams: { id: "2" },
  defaultSearch: { page: "2" },
  encodeParams: (channels: ParamsSearch) => channels,
  decodeParams: (channels: ParamsSearch) => channels,
  canActivate: () => () => true,
  canDeactivate: () => () => true,
  // Load-bearing, unlike its `Route` twin: `RouteConfigUpdate` is closed (no index
  // signature), so this clause rejects a wrongly-typed fixture — it is what forced
  // the two codecs above to take `ParamsSearch` instead of the `unknown` the first
  // version used, which would have satisfied nothing.
} satisfies Partial<RouteConfigUpdate>;

const ROUTE_KEYS = declaredMembers(TYPES_FILE, "Route");
const UPDATE_KEYS = declaredMembers(TYPES_FILE, "RouteConfigUpdate");

describe("Route-key authority — the type decides what is structural (#1738)", () => {
  it("the derived key sets are non-empty and fully covered by fixtures", () => {
    // Non-vacuity FIRST: every assertion below iterates these lists, so a
    // renamed interface or a broken walk would otherwise leave this file green
    // while checking nothing at all.
    expect(ROUTE_KEYS.length).toBeGreaterThan(5);
    expect(UPDATE_KEYS.length).toBeGreaterThan(5);

    // And the fixtures cover them — this is the assertion that turns "someone
    // added a field to `Route`" into a red test rather than a silent gap.
    expect(ROUTE_KEYS.filter((key) => !(key in ROUTE_FIXTURE))).toStrictEqual(
      [],
    );
    expect(UPDATE_KEYS.filter((key) => !(key in UPDATE_FIXTURE))).toStrictEqual(
      [],
    );
  });

  it("a route built from EVERY declared field exposes no custom fields", () => {
    const router = createRouter([]);

    getRoutesApi(router).add(
      Object.fromEntries(
        ROUTE_KEYS.map((key) => [
          key,
          ROUTE_FIXTURE[key as keyof typeof ROUTE_FIXTURE],
        ]),
      ) as unknown as Route,
    );

    expect(getPluginApi(router).getRouteConfig("auth")).toBeUndefined();

    // CONTROL — the bag is reachable and does report a genuine plugin field, so
    // the assertion above pins a classification rather than a broken door.
    getRoutesApi(router).add({
      name: "custom",
      path: "/custom",
      onEnter: () => () => {},
    });

    expect(getPluginApi(router).getRouteConfig("custom")).toStrictEqual({
      onEnter: expect.any(Function),
    });

    router.dispose();
  });

  it.each(UPDATE_KEYS)(
    "update({ %s }) writes no custom field",
    (key: string) => {
      const router = createRouter([
        {
          name: "auth",
          path: "/auth/:id?page",
          children: [{ name: "kid", path: "/kid" }],
        },
      ]);

      getRoutesApi(router).update("auth", {
        [key]: UPDATE_FIXTURE[key as keyof typeof UPDATE_FIXTURE],
      });

      expect(getPluginApi(router).getRouteConfig("auth")).toBeUndefined();

      router.dispose();
    },
  );

  it("the PATCHABLE keys are exactly the set minus route identity", () => {
    // ⚑ The third side of the mirror, and it was missing while the set's own doc
    // comment asserted it outright ("the remaining seven … are exactly the members
    // of `RouteConfigUpdate`"). Without it: add a field to `Route`, to the set and
    // to both fixtures, but forget `RouteConfigUpdate` — the field is then
    // classified STRUCTURAL while no `update` branch carries it, so a patch drops
    // it silently, `it.each(UPDATE_KEYS)` generates no case for it, and the whole
    // tier stays green. Asserted as a two-way difference so neither a missing nor
    // an extra patchable key can hide.
    const IDENTITY = new Set(["name", "path", "children"]);
    const patchable = standardRouteKeys().filter((key) => !IDENTITY.has(key));

    expect(patchable.length).toBeGreaterThan(0);
    expect(patchable.filter((key) => !UPDATE_KEYS.includes(key))).toStrictEqual(
      [],
    );
    expect(UPDATE_KEYS.filter((key) => !patchable.includes(key))).toStrictEqual(
      [],
    );
  });

  it("every STANDARD_ROUTE_KEY is a field `Route` declares — no phantom entry", () => {
    // The reverse direction, and the one the public API cannot show: a key in the
    // set that the type does not declare would classify a PLUGIN field as core
    // config and swallow it out of `getRouteConfig` — silently, since the plugin
    // would simply read `undefined`. Adding `"preload"` here would break
    // `@real-router/preload-plugin` with nothing to notice it.
    const keys = standardRouteKeys();

    expect(keys.length).toBeGreaterThan(5);
    expect(keys.filter((key) => !ROUTE_KEYS.includes(key))).toStrictEqual([]);

    // ⚑ Together with the behavioural direction above this means the two lists
    // are EQUAL — the claim the set's own doc comment makes about itself — and an
    // explicit equality assertion here was DROPPED rather than forgotten: a key
    // missing from the set reds the behavioural test (it lands in the bag), a
    // phantom key reds the filter above, so a third form would fail only when
    // one of those already has, and be a planted equivalent mutant.
  });
});
