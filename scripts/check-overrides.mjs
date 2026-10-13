#!/usr/bin/env node
// The `overrides` of every pnpm workspace of the repository against its tree
// (#2646): `scripts/overrides.mjs` holds the rules. Run from anywhere inside
// the repository; each workspace with overrides must be installed.
//
// Exit 0 when every finding is accepted, 1 with an open finding or an accepted
// one no longer found, 2 when a form or a tree cannot be read or the check
// itself fails.
import { execFileSync } from "node:child_process";

import {
  ACCEPTED_FILE,
  OverridesRefusal,
  judgeWorkspace,
  readAccepted,
  settle,
  workspaceDirs,
} from "./overrides.mjs";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

let results;
let accepted;
try {
  const dirs = workspaceDirs(root);
  if (dirs.length === 0) {
    throw new OverridesRefusal("git tracks no pnpm-workspace.yaml");
  }
  results = dirs.map((dir) => judgeWorkspace(root, dir));
  accepted = readAccepted(root);
} catch (error) {
  if (error instanceof OverridesRefusal) {
    console.error(`✖ overrides: cannot judge — ${error.message}`);
  } else {
    console.error("✖ overrides: cannot judge — the check itself failed:");
    console.error(error);
  }
  process.exit(2);
}

for (const { label, unjudged } of results) {
  for (const override of unjudged) {
    console.log(
      `ℹ ${label}: ${override.key}: ${override.written} — not judged dead: it holds the root's own ${override.reference} (${override.value})`,
    );
  }
}

const { open, kept, stale } = settle(results, accepted);
for (const { label, override, entry } of kept) {
  console.log(
    `ℹ ${label}: ${override.key}: ${entry.rule} — accepted: ${entry.why}`,
  );
}

const keys = results.reduce((sum, { overrides }) => sum + overrides.length, 0);
if (open.length > 0) {
  console.error(
    `✖ overrides: ${String(open.length)} of ${String(keys)} key(s) break a rule:`,
  );
  for (const { label, override, found } of open) {
    console.error(`  ${label}: ${override.key}: ${override.written}`);
    for (const { rule, detail } of found)
      console.error(`    ${rule} — ${detail}`);
  }
}
if (stale.length > 0) {
  console.error(
    `✖ overrides: ${String(stale.length)} accepted finding(s) no longer found — remove them from ${ACCEPTED_FILE}:`,
  );
  for (const { workspace, key, rule } of stale) {
    console.error(`  ${workspace}: ${key}: ${rule}`);
  }
}
if (open.length > 0 || stale.length > 0) process.exit(1);

console.log(
  `✅ overrides: ${String(keys)} key(s) in ${String(results.length)} workspace(s) break no rule${kept.length > 0 ? `; ${String(kept.length)} finding(s) accepted` : ""}`,
);
