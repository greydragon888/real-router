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
import { globSync, readFileSync } from "node:fs";
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
