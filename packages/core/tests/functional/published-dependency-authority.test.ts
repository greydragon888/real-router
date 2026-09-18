// CLASS guard: a published package reaches its consumer's `node_modules` through
// `dependencies`, and in this repository that door admits `@real-router/*` only.
// Everything external is a `peerDependencies` range (the published contract) or a
// `devDependencies` entry (tooling that never ships).
//
// The rule held across every public package on the day this was written, and it
// held by architecture rather than by a gate — which is the whole reason for the
// file. Nothing enforced it: syncpack's `dependencyTypes: ["prod", "dev"]` groups
// govern the RANGE a dependency may carry, not the SECTION it may sit in, and no
// test or CI step asserted the shape at all.
//
// ⚠ What an external `dependencies` entry would cost is not "an extra install".
// It would become a versioned, installed contract that the release pipeline does
// not treat as one: `changeset-check.yml` asks for a changeset when a public
// package's `src/` changes, so a manifest-only edit adding such an entry ships on
// the next release with nothing having asked about it. A peer range moving is the
// same kind of event and DOES have a rule (a peer-dependent takes a `patch` when
// the new version leaves the declared range); the third door has none.
//
// ⚠ This is also what makes `/bump-dep`'s delivery verdict sound for a dependency
// OUTSIDE the root manifest. That skill's root gate is a structural stand-in for
// "devDeps-only ⇒ not delivered ⇒ no changeset". Outside the root the stand-in is
// gone, and what replaces it is exactly this invariant plus one question: is the
// package a public `peerDependencies` entry? The invariant is only load-bearing
// while something holds it, and that is this file.
import { globSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../..");

const isInternal = (name: string): boolean => name.startsWith("@real-router/");

interface Manifest {
  readonly private?: boolean;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

interface PublicPackage {
  readonly dir: string;
  readonly deps: string[];
  readonly peers: string[];
}

const publicPackages = (): PublicPackage[] =>
  globSync("packages/*/package.json", { cwd: REPO_ROOT })
    .map((file) => ({
      dir: path.dirname(file),
      manifest: JSON.parse(
        readFileSync(path.join(REPO_ROOT, file), "utf8"),
      ) as Manifest,
    }))
    .filter(({ manifest }) => manifest.private !== true)
    .map(({ dir, manifest }) => ({
      dir,
      deps: Object.keys(manifest.dependencies ?? {}),
      peers: Object.keys(manifest.peerDependencies ?? {}),
    }));

describe("a public package installs nothing external on its consumer", () => {
  const packages = publicPackages();

  it("names only @real-router/* in dependencies", () => {
    const offenders = packages
      .map(({ dir, deps }) => ({
        dir,
        external: deps.filter((d) => !isInternal(d)),
      }))
      .filter(({ external }) => external.length > 0);

    expect(offenders).toStrictEqual([]);
  });

  // Three ways for the arm above to pass while measuring nothing, each closed by
  // its own assertion: the glob matched no manifest, the `private` filter kept
  // none, or `dependencies` was never read. A guard that looked at an empty set
  // reports an empty set of offenders too.
  it("looked at public packages, and read their dependencies", () => {
    expect(packages.length).toBeGreaterThan(0);
    expect(packages.flatMap(({ deps }) => deps).length).toBeGreaterThan(0);
  });

  // The arm above rests entirely on `isInternal`, and an inverted or broken
  // predicate makes the offender list empty for the wrong reason. Externals are
  // observable in the OTHER section, so the same predicate is made to find them
  // there: zero here means the classifier, not the tree, is what is clean.
  it("classifies external names as external, seen in peerDependencies", () => {
    const externalPeers = packages.flatMap(({ peers }) =>
      peers.filter((p) => !isInternal(p)),
    );

    expect(externalPeers.length).toBeGreaterThan(0);
  });
});

/** Every file under `directory`, FOLLOWING symlinks — `globSync` does not enter `src/shared-ssr` and its siblings. */
const walk = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);

    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const sourceFiles = (directory: string): string[] =>
  walk(directory).filter((file) => /\.(?:ts|tsx|svelte|vue)$/.test(file));

/** An import or re-export statement's head, and the `@real-router/*` package it names. */
const SPECIFIER =
  /(?:import|export)([^"';]*)from\s*["'](@real-router\/[^"'/]+)/g;

const TYPE_ONLY_HEAD = /^\s*type\s/;

const runtimeImports = (text: string): string[] =>
  [...text.matchAll(SPECIFIER)]
    .filter((match) => !TYPE_ONLY_HEAD.test(match[1]))
    .map((match) => match[2]);

interface PackageImports {
  readonly name: string;
  readonly imported: readonly string[];
  readonly undeclared: readonly string[];
}

const publicPackageImports = (): PackageImports[] =>
  globSync("packages/*/package.json", { cwd: REPO_ROOT })
    .map((file) => ({
      dir: path.join(REPO_ROOT, path.dirname(file)),
      manifest: JSON.parse(
        readFileSync(path.join(REPO_ROOT, file), "utf8"),
      ) as Manifest & { readonly name: string },
    }))
    .filter(({ manifest }) => manifest.private !== true)
    .map(({ dir, manifest }) => {
      const declared = new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
      ]);
      const imported = [
        ...new Set(
          sourceFiles(path.join(dir, "src")).flatMap((file) =>
            runtimeImports(readFileSync(file, "utf8")),
          ),
        ),
      ].filter((name) => name !== manifest.name);

      return {
        name: manifest.name,
        imported,
        undeclared: imported.filter((name) => !declared.has(name)),
      };
    });

// CLASS guard (#2361): `tsdown` externalises `dependencies` and
// `peerDependencies` and BUNDLES an imported `devDependencies` entry, so an
// undeclared import ships as a private copy inside the importer. For a package
// that holds module state that is a silent split — `ssr-utils`' hydration
// scratchpad is written by one copy and read from another, and the loader runs
// again with no error. Nothing else notices: unit tests resolve `src`, and the
// bundle succeeds.
describe("a public package declares every @real-router/* package its source imports", () => {
  const packages = publicPackageImports();
  const importsOf = (name: string): readonly string[] =>
    packages.find((entry) => entry.name === name)?.imported ?? [];

  it("imports at runtime only what dependencies or peerDependencies declare", () => {
    expect(
      packages
        .filter(({ undeclared }) => undeclared.length > 0)
        .map(({ name, undeclared }) => ({ name, undeclared })),
    ).toStrictEqual([]);
  });

  // CONTROL: `shared/ssr` is the only place the SSR plugins import `ssr-utils`,
  // so a walk that skips symlinks reports both clean for the wrong reason.
  it("reads the symlinked shared sources", () => {
    expect(importsOf("@real-router/ssr-data-plugin")).toContain(
      "@real-router/ssr-utils",
    );
    expect(importsOf("@real-router/rsc-server-plugin")).toContain(
      "@real-router/ssr-utils",
    );
  });

  // CONTROL for the parser: type-only imports ship nothing, and a re-export
  // ships its package the way an import does.
  it("counts runtime imports and re-exports, and skips type-only ones", () => {
    expect(
      runtimeImports(
        [
          'import type { A } from "@real-router/a";',
          'import { b } from "@real-router/b/api";',
          'export type { C } from "@real-router/c";',
          'export { d } from "@real-router/d";',
          "import {\n  e,\n  f as g,\n} from '@real-router/e';",
        ].join("\n"),
      ),
    ).toStrictEqual(["@real-router/b", "@real-router/d", "@real-router/e"]);
  });
});
