// overrides.mjs — the `overrides` of each pnpm workspace against its tree
// (#2646).
//
// An override rewrites the specifier a manifest declares for a dependency — in
// `dependencies`, `optionalDependencies`, `devDependencies` and
// `peerDependencies` — before pnpm resolves it. Three rules, per workspace and
// per key, over the edges the key rewrites:
//
//   - dead: the value narrows none of them — each declared range admits only
//     versions the value admits too. A `$name` value, the root's own specifier
//     of `name`, is not judged here: it holds the root's version against a
//     future tree, whatever today's edges declare. The output names it.
//   - below: the lowest version the value admits is under the lowest version
//     some edge declares, so it admits a version that parent does not take.
//   - edge: a key with a parent names an edge the tree lacks; or the key
//     rewrites the specifier the lockfile records for a direct dependency of a
//     workspace project — compared with its manifest's, or with its
//     `peerDependencies` for a peer pnpm installs itself.
//
// Which key rewrites an edge follows pnpm 12.11.2
// (`pnpm/crates/package-manager/src/overrides.rs` and `overrides/selectors.rs`):
// a key with a parent applies to a manifest of that name whose version
// satisfies the parent's range, and wins over a key without one; a key's range
// matches a declared specifier it intersects; among several matching keys the
// comparator of `sort_by_specificity` decides, and a tie keeps the order of the
// file.
//
// A finding kept on purpose is listed, with its reason, in
// `scripts/overrides-accepted.json` of the repository the check reads; an
// entry no finding matches fails the check.
//
// ⚠ The lockfile records resolved versions, and peer ranges as the overrides
// rewrote them, not the ranges the parents declare. Those come from the
// manifests in the workspace's virtual store, `node_modules/.pnpm`, so the
// workspace must be installed. A package pnpm skipped there (`skipped` in
// `node_modules/.modules.yaml`) has no manifest, and an edge from it that a key
// could rewrite is refused, not passed over. So is an edge the manifest on disk
// does not declare: a `readPackage` hook of `.pnpmfile.mjs` and pnpm's own
// package extensions edit a manifest in memory only.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import semver from "semver";
import { isMap, isScalar } from "yaml";

import { ClosedYamlError, readClosedYaml } from "./closed-yaml.mjs";

/** A form the rules do not read, or a tree they cannot read. */
export class OverridesRefusal extends Error {}

/**
 * @param {string} message
 * @returns {never}
 */
function refuse(message) {
  throw new OverridesRefusal(message);
}

/**
 * The one YAML document of `text`, read closed; a form it refuses is a
 * refusal of the check, named by `file`.
 *
 * @param {string} text
 * @param {string} file
 */
function readYaml(text, file) {
  try {
    return readClosedYaml(text);
  } catch (error) {
    if (error instanceof ClosedYamlError) refuse(`${file}: ${error.message}`);
    throw error;
  }
}

/**
 * A JSON file; a file that is missing or does not parse is a refusal.
 *
 * @param {string} file
 * @param {string} shown how the output names it
 */
function readJson(file, shown) {
  if (!existsSync(file)) refuse(`${shown}: not found`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      refuse(`${shown}: not JSON (${error.message})`);
    }
    throw error;
  }
}

/**
 * @typedef {object} Selector
 * @property {string} name
 * @property {string} [range]
 */

/**
 * @typedef {object} Override
 * @property {string} key       as written
 * @property {string} written   the value as written
 * @property {string} value     the value pnpm applies: for `$name`, the root's specifier
 * @property {string} [reference] the dependency a `$name` value names
 * @property {Selector} [parent]
 * @property {Selector} target
 */

/**
 * @typedef {object} Edge
 * @property {string} from        the parent, as the output names it
 * @property {string} parentName  its manifest's name
 * @property {string} [parentVersion]
 * @property {string} [importer]  the project's directory, for a direct dependency
 * @property {string} name        the dependency, as its parent declares it
 * @property {string} [declared]  the parent's specifier: undefined when the
 *                                parent is not installed or declares none
 * @property {boolean} installed  whether the parent's manifest was read
 * @property {"specifier" | "peer" | "version"} recordedAs what the lockfile
 *                                records for it: a project's specifier, a
 *                                package's peer range, or the version resolved
 * @property {(string | undefined)[]} recorded one per peer variant of the parent
 */

/**
 * @typedef {object} Finding
 * @property {"dead" | "below" | "edge"} rule
 * @property {string} detail
 */

/**
 * @param {Record<string, unknown> | undefined} record
 * @param {string} name
 * @returns {string | undefined}
 */
function own(record, name) {
  if (record === null || typeof record !== "object") return undefined;
  const value = Object.hasOwn(record, name) ? record[name] : undefined;
  return typeof value === "string" ? value : undefined;
}

const PACKAGE_NAME = /^(?:@[^\s/@>]+\/)?[^\s/@>]+$/;

/**
 * One half of a key: a name, and the range after its `@`.
 *
 * @param {string} text
 * @param {string} key
 * @returns {Selector}
 */
function selectorOf(text, key) {
  const at = text.indexOf("@", text.startsWith("@") ? 1 : 0);
  const name = at === -1 ? text : text.slice(0, at);
  if (!PACKAGE_NAME.test(name)) {
    refuse(`${key}: "${name}" is not a package name`);
  }
  if (at === -1) return { name };
  const range = text.slice(at + 1);
  if (range === "") {
    refuse(
      `${key}: a convergence key ("name@"), which this check does not read`,
    );
  }
  if (semver.validRange(range) === null) {
    refuse(`${key}: "${range}" is not a semver range`);
  }
  return { name, range };
}

/**
 * The parent and target of a key. pnpm splits at the first `>` whose
 * preceding character is not a space, `|` or `@`.
 *
 * @param {string} key
 * @returns {{ parent?: Selector, target: Selector }}
 */
export function parseKey(key) {
  if (/\s/.test(key)) refuse(`${key}: a key with whitespace`);
  const split = /[^ |@]>/.exec(key);
  if (split === null) return { target: selectorOf(key, key) };
  const at = split.index + 1;
  // A second `>` stays in the child's name, which `PACKAGE_NAME` refuses.
  return {
    parent: selectorOf(key.slice(0, at), key),
    target: selectorOf(key.slice(at + 1), key),
  };
}

/**
 * The overrides of a workspace, in the order of its file, each with the value
 * pnpm applies.
 *
 * @param {string} workspaceText `pnpm-workspace.yaml`
 * @param {Record<string, unknown>} rootManifest the workspace root's `package.json`
 * @returns {Override[]}
 */
export function readOverrides(workspaceText, rootManifest) {
  const overrides = readYaml(workspaceText, "pnpm-workspace.yaml").get(
    "overrides",
  );
  if (overrides === undefined) return [];
  if (!isMap(overrides)) refuse("`overrides` is not a map");
  return overrides.items.map(({ key: keyNode, value: valueNode }) => {
    if (!isScalar(keyNode) || typeof keyNode.value !== "string") {
      refuse("an override key that is not a string");
    }
    const key = keyNode.value;
    if (!isScalar(valueNode) || typeof valueNode.value !== "string") {
      refuse(`${key}: a value that is not a string`);
    }
    const written = valueNode.value;
    // pnpm reads `$name` in the root's devDependencies, dependencies and
    // optionalDependencies, the last that declares it winning.
    const reference = written.startsWith("$") ? written.slice(1) : undefined;
    const value =
      reference === undefined
        ? written
        : (own(rootManifest.optionalDependencies, reference) ??
          own(rootManifest.dependencies, reference) ??
          own(rootManifest.devDependencies, reference) ??
          refuse(
            `${key}: ${written} names no dependency of the root manifest`,
          ));
    if (value === "" || semver.validRange(value) === null) {
      refuse(
        `${key}: "${value}" is not a semver range, which this check reads alone`,
      );
    }
    return {
      key,
      written,
      value,
      ...(reference === undefined ? {} : { reference }),
      ...parseKey(key),
    };
  });
}

/**
 * The name and version of a lockfile's package key, its peer suffix off.
 *
 * @param {string} key
 */
function nameAndVersion(key) {
  const bare = key.split("(")[0];
  const at = bare.indexOf("@", bare.startsWith("@") ? 1 : 0);
  return { name: bare.slice(0, at), version: bare.slice(at + 1) };
}

/**
 * Where a manifest declares a dependency of an installed package:
 * `optionalDependencies` over `dependencies`, then `peerDependencies`.
 *
 * @param {Record<string, unknown>} manifest
 * @param {string} name
 */
function declaredBy(manifest, name) {
  const regular =
    own(manifest.optionalDependencies, name) ??
    own(manifest.dependencies, name);
  if (regular !== undefined) return { declared: regular, peer: false };
  const peer = own(manifest.peerDependencies, name);
  return { declared: peer, peer: peer !== undefined };
}

/**
 * Every edge of a lockfile: a package's resolved dependency, and a project's
 * direct one, each with the specifier its parent declares.
 *
 * @param {Record<string, any>} lockfile
 * @param {Map<string, Record<string, unknown>>} manifests `name@version` → installed manifest
 * @param {Map<string, Record<string, unknown>>} projects importer directory → manifest
 * @returns {Edge[]}
 */
export function edgesOf(lockfile, manifests, projects) {
  /** @type {Map<string, Edge>} */
  const edges = new Map();
  for (const [key, snapshot] of Object.entries(lockfile.snapshots ?? {})) {
    const { name, version } = nameAndVersion(key);
    const from = `${name}@${version}`;
    const manifest = manifests.get(from);
    for (const [dep, resolved] of Object.entries({
      ...snapshot?.dependencies,
      ...snapshot?.optionalDependencies,
    })) {
      const { declared, peer } =
        manifest === undefined
          ? { declared: undefined, peer: false }
          : declaredBy(manifest, dep);
      // pnpm records the peer ranges of `packages` as the overrides rewrite
      // them, and a version per peer variant of the parent.
      const recorded = peer
        ? own(lockfile.packages?.[from]?.peerDependencies, dep)
        : String(resolved).split("(")[0];
      const id = `${from}>${dep}`;
      const known = edges.get(id);
      if (known !== undefined) {
        known.recorded.push(recorded);
        continue;
      }
      edges.set(id, {
        from,
        parentName: name,
        parentVersion: version,
        name: dep,
        declared,
        installed: manifest !== undefined,
        recordedAs: peer ? "peer" : "version",
        recorded: [recorded],
      });
    }
  }
  for (const [dir, importer] of Object.entries(lockfile.importers ?? {})) {
    const manifest = projects.get(dir) ?? refuse(`${dir}: no package.json`);
    for (const group of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]) {
      for (const [dep, entry] of Object.entries(importer?.[group] ?? {})) {
        // A peer pnpm installs itself is listed with the project's
        // dependencies, and declared only in its peerDependencies.
        const declared =
          own(/** @type {any} */ (manifest)[group], dep) ??
          own(manifest.peerDependencies, dep);
        edges.set(`importer ${dir}>${dep}`, {
          from: dir === "." ? "the root project" : `the project ${dir}`,
          parentName: own(manifest, "name") ?? "",
          parentVersion: own(manifest, "version"),
          importer: dir,
          name: dep,
          declared,
          installed: true,
          recordedAs: "specifier",
          recorded: [own(entry, "specifier")],
        });
      }
    }
  }
  return [...edges.values()];
}

/**
 * pnpm's `is_intersecting_range`: a key without a range matches every
 * specifier. pnpm's semver does not parse an empty range, where npm's semver
 * reads `*`.
 *
 * @param {string | undefined} range
 * @param {string} spec
 */
function intersecting(range, spec) {
  if (range === undefined || range === "" || spec === range) return true;
  if (spec === "" || semver.validRange(spec) === null) return false;
  return semver.intersects(range, spec);
}

/**
 * @param {Selector} parent
 * @param {Edge} edge
 */
function appliesTo(parent, edge) {
  if (parent.name !== edge.parentName) return false;
  if (parent.range === undefined) return true;
  return (
    edge.parentVersion !== undefined &&
    semver.valid(edge.parentVersion) !== null &&
    semver.satisfies(edge.parentVersion, parent.range)
  );
}

/**
 * pnpm's `sort_by_specificity`: a key whose range the other's covers sorts
 * first. `Array.prototype.sort` is stable, as Rust's `sort_by` is.
 *
 * @param {Override} lhs
 * @param {Override} rhs
 */
function bySpecificity(lhs, rhs) {
  const left = lhs.target.range ?? "";
  const right = rhs.target.range ?? "";
  const rightCoversLeft = intersecting(right, left);
  const leftCoversRight = intersecting(left, right);
  if (rightCoversLeft === leftCoversRight) return 0;
  return rightCoversLeft ? -1 : 1;
}

/**
 * @param {Override[]} candidates
 * @param {Edge} edge
 * @param {string} declared
 */
function mostSpecific(candidates, edge, declared) {
  return candidates
    .filter(
      (override) =>
        override.target.name === edge.name &&
        intersecting(override.target.range, declared),
    )
    .sort(bySpecificity)[0];
}

/**
 * What the lockfile records for an edge and the check does not derive: a
 * specifier or peer range other than the derived one, a resolved version
 * outside it. A version the check cannot compare — a link, an alias, a URL —
 * passes.
 *
 * @param {Edge} edge
 * @param {string} effective
 */
function recordedOtherwise(edge, effective) {
  return edge.recorded.find((recorded) => {
    if (edge.recordedAs !== "version") return recorded !== effective;
    if (
      recorded === undefined ||
      semver.valid(recorded) === null ||
      semver.validRange(effective) === null
    ) {
      return false;
    }
    return !semver.satisfies(recorded, effective, { includePrerelease: true });
  });
}

/**
 * The key pnpm applies to an edge, if any.
 *
 * @param {Override[]} overrides
 * @param {Edge} edge
 * @param {string} declared
 * @returns {Override | undefined}
 */
export function chooseOverride(overrides, edge, declared) {
  const scoped = overrides.filter(
    (override) =>
      override.parent !== undefined && appliesTo(override.parent, edge),
  );
  const generic = overrides.filter((override) => override.parent === undefined);
  return (
    mostSpecific(scoped, edge, declared) ??
    mostSpecific(generic, edge, declared)
  );
}

/**
 * The findings of a workspace, each key with its own, in the order of its
 * file; and the `$name` keys "dead" does not judge.
 *
 * @param {Override[]} overrides
 * @param {Edge[]} edges
 * @returns {{ findings: Map<Override, Finding[]>, unjudged: Override[] }}
 */
export function judge(overrides, edges) {
  for (const edge of edges) {
    if (edge.declared !== undefined) continue;
    const reached = overrides.some(
      (override) =>
        override.target.name === edge.name &&
        (override.parent === undefined || appliesTo(override.parent, edge)),
    );
    if (!reached) continue;
    refuse(
      edge.installed
        ? `${edge.from} declares no ${edge.name} in its manifest on disk — a pnpmfile hook or pnpm's package extensions add the edge in memory — so the check cannot tell which key pnpm applies to it`
        : `${edge.from}, a parent of ${edge.name}, has no manifest in node_modules/.pnpm: install the workspace, or pnpm skipped it (\`skipped\` in node_modules/.modules.yaml)`,
    );
  }

  /** @type {Map<Override, (Edge & { declared: string })[]>} */
  const rewritten = new Map(overrides.map((override) => [override, []]));
  for (const edge of edges) {
    if (edge.declared === undefined) continue;
    const chosen = chooseOverride(overrides, edge, edge.declared);
    const effective = chosen?.value ?? edge.declared;
    const otherwise = recordedOtherwise(edge, effective);
    if (otherwise !== undefined || edge.recorded.includes(undefined)) {
      refuse(
        `the lockfile records ${String(otherwise)} for ${edge.name} in ${edge.from}, where the check derives ${effective}${chosen === undefined ? "" : ` from ${chosen.key}`}: how pnpm applies overrides is not what this check reads`,
      );
    }
    if (chosen === undefined) continue;
    if (edge.declared === "" || semver.validRange(edge.declared) === null) {
      refuse(
        `${chosen.key} rewrites "${edge.declared}", a specifier of ${edge.name} in ${edge.from} that is not a semver range`,
      );
    }
    rewritten
      .get(chosen)
      ?.push(/** @type {Edge & { declared: string }} */ (edge));
  }

  /** @type {Map<Override, Finding[]>} */
  const findings = new Map();
  /** @type {Override[]} */
  const unjudged = [];
  for (const override of overrides) {
    const acted = rewritten.get(override) ?? [];
    const narrowed = acted.filter(
      (edge) => !semver.subset(edge.declared, override.value),
    );
    /** @type {Finding[]} */
    const found = [];

    if (override.reference !== undefined) {
      unjudged.push(override);
    } else if (acted.length === 0) {
      found.push({ rule: "dead", detail: "it rewrites no edge" });
    } else if (narrowed.length === 0) {
      found.push({
        rule: "dead",
        detail: `it narrows none of the ${String(acted.length)} edge(s) it rewrites: ${example(acted)}`,
      });
    }

    const floor = semver.minVersion(override.value);
    const top = acted
      .map((edge) => ({ edge, min: semver.minVersion(edge.declared) }))
      .filter((entry) => entry.min !== null)
      .sort((a, b) => semver.rcompare(a.min ?? "0.0.0", b.min ?? "0.0.0"))[0];
    if (floor !== null && top?.min && semver.lt(floor, top.min)) {
      found.push({
        rule: "below",
        detail: `the lowest version it admits, ${floor.version}, is under ${top.edge.declared}, the range ${top.edge.from} declares for ${override.target.name}`,
      });
    }

    const { parent } = override;
    if (
      parent !== undefined &&
      !edges.some(
        (edge) => edge.name === override.target.name && appliesTo(parent, edge),
      )
    ) {
      found.push({
        rule: "edge",
        detail: `no ${parent.name}${parent.range === undefined ? "" : `@${parent.range}`} in the tree depends on ${override.target.name}`,
      });
    }

    for (const edge of acted) {
      const [recorded] = edge.recorded;
      if (edge.importer === undefined || recorded === edge.declared) continue;
      found.push({
        rule: "edge",
        detail: `it rewrites the specifier of ${edge.name} in ${edge.from}: the manifest declares ${edge.declared}, the lockfile records ${String(recorded)}`,
      });
    }

    if (found.length > 0) findings.set(override, found);
  }
  return { findings, unjudged };
}

/**
 * Up to two of the edges, as `parent asks range`.
 *
 * @param {Edge[]} edges
 */
function example(edges) {
  const shown = edges
    .slice(0, 2)
    .map((edge) => `${edge.from} declares ${String(edge.declared)}`);
  const rest = edges.length - shown.length;
  return rest > 0
    ? `${shown.join(", ")} and ${String(rest)} more`
    : shown.join(", ");
}

/**
 * The manifests of a workspace's virtual store, by `name@version`.
 *
 * @param {string} dir the workspace's directory
 * @returns {Map<string, Record<string, unknown>>}
 */
export function installedManifests(dir) {
  const store = path.join(dir, "node_modules", ".pnpm");
  if (!existsSync(store)) {
    refuse(
      "not installed: no node_modules/.pnpm, from which the declared ranges are read",
    );
  }
  /** @type {Map<string, Record<string, unknown>>} */
  const manifests = new Map();
  /** @param {string} file */
  const read = (file) => {
    if (!existsSync(file)) return;
    const manifest = readJson(file, path.relative(dir, file));
    manifests.set(`${manifest.name}@${manifest.version}`, manifest);
  };
  for (const entry of readdirSync(store, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;
    const modules = path.join(store, entry.name, "node_modules");
    if (!existsSync(modules)) continue;
    // The package itself is the one directory; its dependencies are links.
    for (const child of readdirSync(modules, { withFileTypes: true })) {
      if (!child.isDirectory()) continue;
      if (!child.name.startsWith("@")) {
        read(path.join(modules, child.name, "package.json"));
        continue;
      }
      for (const scoped of readdirSync(path.join(modules, child.name), {
        withFileTypes: true,
      })) {
        if (scoped.isDirectory()) {
          read(path.join(modules, child.name, scoped.name, "package.json"));
        }
      }
    }
  }
  return manifests;
}

/**
 * The directories of the workspaces: each one that holds a tracked
 * `pnpm-workspace.yaml`, the root among them — `.` for the root.
 *
 * @param {string} root the repository's top level
 * @returns {string[]}
 */
export function workspaceDirs(root) {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 ** 3,
  })
    .split("\0")
    .filter((file) => path.posix.basename(file) === "pnpm-workspace.yaml")
    .map((file) => path.posix.dirname(file))
    .sort();
}

/**
 * Judge one workspace of the repository.
 *
 * @param {string} root the repository's top level
 * @param {string} dir the workspace's directory, relative to `root`
 */
export function judgeWorkspace(root, dir) {
  const label = dir === "." ? "the root workspace" : dir;
  try {
    return { dir, label, ...judgeAt(path.join(root, dir)) };
  } catch (error) {
    if (error instanceof OverridesRefusal) refuse(`${label}: ${error.message}`);
    throw error;
  }
}

/**
 * The overrides of the workspace at `base` and what the rules find in them.
 *
 * @param {string} base
 */
function judgeAt(base) {
  const overrides = readOverrides(
    readFileSync(path.join(base, "pnpm-workspace.yaml"), "utf8"),
    readJson(path.join(base, "package.json"), "package.json"),
  );
  if (overrides.length === 0) {
    return { overrides, findings: new Map(), unjudged: [] };
  }
  const lockfilePath = path.join(base, "pnpm-lock.yaml");
  if (!existsSync(lockfilePath)) refuse("no pnpm-lock.yaml");
  const lockfile = readYaml(
    readFileSync(lockfilePath, "utf8"),
    "pnpm-lock.yaml",
  ).toJS();
  if (lockfile?.lockfileVersion !== "9.0") {
    refuse(
      `lockfileVersion ${String(lockfile?.lockfileVersion)}, where this check reads 9.0`,
    );
  }
  const projects = new Map(
    Object.keys(lockfile.importers ?? {}).map((importer) => [
      importer,
      readJson(
        path.join(base, importer, "package.json"),
        path.posix.join(importer, "package.json"),
      ),
    ]),
  );
  const edges = edgesOf(lockfile, installedManifests(base), projects);
  return { overrides, ...judge(overrides, edges) };
}

/** The accepted findings, relative to the repository's top level. */
export const ACCEPTED_FILE = "scripts/overrides-accepted.json";

const RULES = ["dead", "below", "edge"];
const ACCEPTED_FIELDS = ["key", "rule", "why", "workspace"];

/**
 * @typedef {object} Accepted
 * @property {string} workspace the workspace's directory, `.` for the root
 * @property {string} key
 * @property {"dead" | "below" | "edge"} rule
 * @property {string} why
 */

/**
 * The findings a repository keeps on purpose; none when it has no list.
 *
 * @param {string} root the repository's top level
 * @returns {Accepted[]}
 */
export function readAccepted(root) {
  const file = path.join(root, ACCEPTED_FILE);
  if (!existsSync(file)) return [];
  const entries = readJson(file, ACCEPTED_FILE);
  if (!Array.isArray(entries)) refuse(`${ACCEPTED_FILE}: not a list`);
  const seen = new Set();
  return entries.map((entry, index) => {
    const at = `${ACCEPTED_FILE}, entry ${String(index + 1)}`;
    if (
      entry === null ||
      typeof entry !== "object" ||
      Object.keys(entry).sort().join() !== ACCEPTED_FIELDS.join() ||
      ACCEPTED_FIELDS.some(
        (field) => typeof entry[field] !== "string" || entry[field] === "",
      )
    ) {
      refuse(
        `${at}: not { workspace, key, rule, why }, each a non-empty string`,
      );
    }
    if (!RULES.includes(entry.rule)) {
      refuse(`${at}: "${entry.rule}" is no rule of the check`);
    }
    const id = [entry.workspace, entry.key, entry.rule].join("\0");
    if (seen.has(id)) refuse(`${at}: a second entry for the same finding`);
    seen.add(id);
    return entry;
  });
}

/**
 * A run's findings, split by the accepted ones: those still open, those an
 * entry accepts, and the entries no finding matches. An entry accepts every
 * finding of its rule for its key in its workspace.
 *
 * @param {{ dir: string, label: string, findings: Map<Override, Finding[]> }[]} results
 * @param {Accepted[]} accepted
 */
export function settle(results, accepted) {
  /** @type {Set<Accepted>} */
  const used = new Set();
  /** @type {{ label: string, override: Override, found: Finding[] }[]} */
  const open = [];
  /** @type {{ label: string, override: Override, entry: Accepted }[]} */
  const kept = [];
  for (const { dir, label, findings } of results) {
    for (const [override, found] of findings) {
      const left = [];
      for (const finding of found) {
        const entry = accepted.find(
          (candidate) =>
            candidate.workspace === dir &&
            candidate.key === override.key &&
            candidate.rule === finding.rule,
        );
        if (entry === undefined) {
          left.push(finding);
        } else if (!used.has(entry)) {
          used.add(entry);
          kept.push({ label, override, entry });
        }
      }
      if (left.length > 0) open.push({ label, override, found: left });
    }
  }
  return { open, kept, stale: accepted.filter((entry) => !used.has(entry)) };
}
