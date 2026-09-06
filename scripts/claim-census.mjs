#!/usr/bin/env node
/**
 * The #2092 ledger's refresh path: show what changed in a file's claims, and —
 * only after you have read it — record the new hashes.
 *
 * Usage:
 *   node scripts/claim-census.mjs --diff [file...]     what drifted, with the text
 *   node scripts/claim-census.mjs --update <file...>   record it (asks for --yes)
 *
 * With no files, `--diff` reports every drifted entry in the ledger.
 *
 * ⚠ **There is deliberately no "rewrite everything" flag.** The manual step is
 * the mechanism: a hash is refreshed AFTER someone re-reads the claim, and a
 * command that silences the whole table would remove the only thing the ledger
 * asserts. What this tool removes is the arithmetic — computing sha1s and
 * editing a data file by hand — not the reading.
 *
 * ⚠ The old text of a drifted claim comes from `git show HEAD:<file>`, so a
 * diff is only as good as the last commit. On a file that was never committed
 * the orphaned side prints hashes alone; that is information, not an error.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { claimHashes, claimParagraphs, isMarkdown } from "./claim-paragraphs.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LEDGER = join(
  ROOT,
  "packages/core/tests/functional/claim-census-ledger.json",
);

const bucketOf = (file) => (isMarkdown(file) ? "docs" : "code");

const readLedger = () => JSON.parse(readFileSync(LEDGER, "utf8"));

const writeLedger = (ledger) => {
  const sorted = Object.fromEntries(
    ["code", "docs"].map((bucket) => [
      bucket,
      Object.fromEntries(
        Object.entries(ledger[bucket]).toSorted(([a], [b]) =>
          a.localeCompare(b),
        ),
      ),
    ]),
  );
  writeFileSync(LEDGER, `${JSON.stringify(sorted, undefined, 2)}\n`);
};

const claimsOf = (file) => {
  const text = readFileSync(join(ROOT, file), "utf8");
  const md = isMarkdown(file);
  return { paragraphs: claimParagraphs(text, md), hashes: claimHashes(text, md) };
};

/** The claims this file carried at HEAD, keyed by hash. */
function claimsAtHead(file) {
  try {
    const text = execFileSync("git", ["show", `HEAD:${file}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const md = isMarkdown(file);
    const paragraphs = claimParagraphs(text, md);
    return new Map(claimHashes(text, md).map((h, i) => [h, paragraphs[i]]));
  } catch {
    return new Map();
  }
}

/** What the ledger and the working tree disagree about, for one file. */
function inspect(file, ledger) {
  const recorded = ledger[bucketOf(file)][file] ?? [];
  const { paragraphs, hashes } = claimsOf(file);
  const current = new Set(hashes);
  const known = new Set(recorded);

  return {
    file,
    recorded,
    hashes,
    orphaned: recorded.filter((h) => !current.has(h)),
    added: hashes.filter((h) => !known.has(h)),
    byHash: new Map(hashes.map((h, i) => [h, paragraphs[i]])),
  };
}

const truncate = (text, lines = 6) => {
  const rows = text.split("\n");
  return rows.length <= lines
    ? text
    : `${rows.slice(0, lines).join("\n")}\n    … ${String(rows.length - lines)} more line(s)`;
};

function report(state) {
  const { file, orphaned, added } = state;
  if (orphaned.length === 0 && added.length === 0) return false;

  console.log(`\n── ${file}`);
  if (orphaned.length > 0) {
    const head = claimsAtHead(file);
    console.log(
      `  EDITED or REMOVED (${String(orphaned.length)}) — re-read before recording:`,
    );
    for (const h of orphaned) {
      console.log(`   ${h}`);
      const was = head.get(h);
      if (was) console.log(`    was: ${truncate(was).replaceAll("\n", "\n    ")}`);
    }
  }
  if (added.length > 0) {
    console.log(`  ADDED (${String(added.length)}):`);
    for (const h of added) {
      console.log(`   ${h}`);
      console.log(
        `    now: ${truncate(state.byHash.get(h) ?? "").replaceAll("\n", "\n    ")}`,
      );
    }
  }
  return true;
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const files = argv.filter((a) => !a.startsWith("--"));
  const ledger = readLedger();

  const targets =
    files.length > 0
      ? files
      : [...Object.keys(ledger.code), ...Object.keys(ledger.docs)];

  const missing = targets.filter((f) => !existsSync(join(ROOT, f)));
  if (missing.length > 0) {
    console.error(`No such file(s): ${missing.join(", ")}`);
    return 1;
  }

  const states = targets.map((f) => inspect(f, ledger));
  const drifted = states.filter((s) => s.orphaned.length + s.added.length > 0);

  if (flags.has("--update")) {
    if (files.length === 0) {
      console.error("--update needs the files to record, and never takes all of them.");
      return 1;
    }
    drifted.forEach(report);
    if (drifted.length === 0) {
      console.log("Nothing to record — the ledger already matches.");
      return 0;
    }
    if (!flags.has("--yes")) {
      console.log(
        "\nRe-read the claims above, then repeat with --yes to record them.",
      );
      return 1;
    }
    for (const s of drifted) ledger[bucketOf(s.file)][s.file] = s.hashes;
    writeLedger(ledger);
    console.log(
      `\nRecorded ${String(drifted.length)} file(s): ${drifted.map((s) => s.file).join(", ")}`,
    );
    return 0;
  }

  if (drifted.length === 0) {
    console.log(`No drift across ${String(targets.length)} ledger entr(ies).`);
    return 0;
  }
  drifted.forEach(report);
  console.log(
    `\n${String(drifted.length)} file(s) drifted. Record with: node scripts/claim-census.mjs --update <file> --yes`,
  );
  return 1;
}

process.exit(main(process.argv.slice(2)));
