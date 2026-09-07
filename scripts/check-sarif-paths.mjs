#!/usr/bin/env node
// check-sarif-paths.mjs — a SARIF report whose paths do not resolve to files in
// this repository is an upload that produces nothing, and says so nowhere.
//
// Run:  node scripts/check-sarif-paths.mjs <report.sarif> [repo-root]
//
// Why this exists (#2154): the `Code Duplication (SARIF)` job uploaded 18
// analyses, each reporting `results_count: 8`, and `code-scanning/alerts?
// tool_name=jscpd` answered `[]` every time. jscpd scans eight roots
// (`packages/*/src/ shared/`), and every URI in its report was relative to its
// OWN root — `index.ts`, `types.ts`, `RxObservable.ts`. GitHub resolves a
// relative SARIF URI against the repository root, found no such files, and
// dropped all eight results. Nothing failed: the upload succeeded, the count
// was truthful, and the channel was dead.
//
// ⚠ The failure is invisible from inside CI by construction — the tool exits 0,
// the upload step exits 0, and the alert count lives in an API this job never
// calls. Only resolving the paths the way GitHub documents catches it, which is
// what this script does, one step before the upload.
//
// The resolution rule is GitHub's own ("Code scanning interprets results that
// are reported with relative paths as relative to the root of the repository
// analyzed. If a result contains an absolute URI, the URI is converted to a
// relative URI."), applied to every physicalLocation in the run — including
// `relatedLocations`, which is where a duplicate's counterpart lives and which
// is just as capable of pointing nowhere.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL as NodeURL } from "node:url";

/**
 * The absolute path a SARIF `artifactLocation` denotes, by GitHub's rule.
 *
 * ⚠ Throws on a shape it does not understand rather than skipping it. A skipped
 * location is a location silently declared fine, which is the defect this
 * script exists to catch — one level down.
 *
 * @param {{uri?: string, uriBaseId?: string}} artifactLocation
 * @param {Record<string, {uri?: string, uriBaseId?: string}>} bases run.originalUriBaseIds
 * @param {string} root repository root, absolute
 * @returns {string} absolute filesystem path
 */
export function resolveArtifactLocation(artifactLocation, bases, root) {
  const uri = artifactLocation?.uri;

  if (typeof uri !== "string" || uri === "") {
    throw new Error(
      `artifactLocation without a uri: ${JSON.stringify(artifactLocation)}`,
    );
  }

  const baseId = artifactLocation.uriBaseId;

  if (baseId === undefined) {
    return uri.startsWith("file:")
      ? fileURLToPath(uri)
      : resolve(root, uri.replace(/^\//, ""));
  }

  const base = bases[baseId];

  if (!base?.uri) {
    throw new Error(`uriBaseId ${baseId} is not defined in originalUriBaseIds`);
  }

  if (base.uriBaseId !== undefined) {
    throw new Error(
      `uriBaseId ${baseId} is itself relative to ${base.uriBaseId}; ` +
        `chained base ids are not handled — extend this script rather than ignoring them`,
    );
  }

  return fileURLToPath(new NodeURL(uri, base.uri));
}

/** Every physicalLocation of a result, primary and related. */
const locationsOf = (result) => [
  ...(result.locations ?? []),
  ...(result.relatedLocations ?? []),
];

/**
 * Which of a report's locations do not name a file in this repository.
 *
 * @param {object} sarif parsed report
 * @param {string} root repository root, absolute
 * @returns {{results: number, checked: number, unresolved: {rule: string, path: string}[]}}
 */
export function checkSarifPaths(sarif, root) {
  const unresolved = [];
  let checked = 0;
  let results = 0;

  for (const run of sarif.runs ?? []) {
    const bases = run.originalUriBaseIds ?? {};

    for (const result of run.results ?? []) {
      results += 1;

      for (const location of locationsOf(result)) {
        const artifactLocation = location.physicalLocation?.artifactLocation;

        if (!artifactLocation) {
          // Not skipped: a location this script cannot read is a location it
          // would otherwise declare fine, which is the defect it exists to
          // catch. Same rule as `resolveArtifactLocation`'s throws.
          throw new Error(
            `result ${result.ruleId ?? "?"} has a location without a physicalLocation.artifactLocation`,
          );
        }

        const path = resolveArtifactLocation(artifactLocation, bases, root);

        checked += 1;

        if (!existsSync(path)) {
          unresolved.push({ rule: result.ruleId ?? "?", path });
        }
      }
    }
  }

  return { results, checked, unresolved };
}

async function main(argv) {
  const [file, rootArg] = argv;

  if (!file) {
    console.error("usage: check-sarif-paths.mjs <report.sarif> [repo-root]");
    return 2;
  }

  const root = resolve(rootArg ?? process.cwd());
  const { readFileSync } = await import("node:fs");
  const { results, checked, unresolved } = checkSarifPaths(
    JSON.parse(readFileSync(file, "utf8")),
    root,
  );

  // ⚠ Two ways to check nothing, and only one of them is fine. No results at
  // all means no clones — a real, quiet pass. Results that carry no resolvable
  // location means this script read a report and learned nothing from it, which
  // is the same silence #2154 is about, one level up.
  if (checked === 0) {
    if (results > 0) {
      console.error(
        `✖ ${file}: ${String(results)} result(s) carry no location to resolve`,
      );
      return 1;
    }

    console.log(`✓ ${file}: no results to resolve`);
    return 0;
  }

  if (unresolved.length > 0) {
    console.error(
      `✖ ${file}: ${String(unresolved.length)} of ${String(checked)} locations do not name a file in ${root}`,
    );
    for (const { rule, path } of unresolved.slice(0, 10)) {
      console.error(`   ${rule}  ${path}`);
    }
    console.error(
      "\nGitHub resolves these against the repository root and drops what it cannot find,\n" +
        "so the upload would succeed and produce no alerts. See #2154.",
    );
    return 1;
  }

  console.log(
    `✓ ${file}: all ${String(checked)} locations resolve inside ${root}`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main(process.argv.slice(2)));
}
