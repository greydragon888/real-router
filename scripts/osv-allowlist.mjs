// osv-allowlist.mjs — the region of `.github/dependency-review-config.yml`
// that sets `allow-ghsas`, which `sync-config.mjs` renders from the GHSA ids of
// `scripts/osv-scanner.toml`, the allowlist of `lint:audit`.
//
// The file is read by a TOML parser, `smol-toml`, as osv-scanner reads it with
// its own: comments, quoting and the two forms of a record are the parser's.
// What this adds is closed. At the top level only `IgnoredVulns`, an array of
// tables; in a record only `id`, a string, and at most `reason`, a string, and
// `ignoreUntil`, a TOML local date; an `id` that starts with `GHSA-` has the
// form `GHSA-xxxx-xxxx-xxxx`, which YAML reads as itself. Any other key, type or
// id, a file that is not UTF-8 and one the parser cannot read are refused by
// name, not skipped. `allow-ghsas` takes the `GHSA-*` ids alone: GitHub
// Dependency Review reads no other kind, and the `RUSTSEC-*` entries are there
// for osv-scanner.
//
// ⚠ A day that does not exist in its month passes as an `ignoreUntil`:
// `smol-toml` rolls 2026-02-30 over to 2026-03-02, and the parsed value cannot
// tell. osv-scanner refuses such a file whole, so `lint:audit` fails on it.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TomlDate, parse } from "smol-toml";

/** The source, from the repository root. */
export const SOURCE = "scripts/osv-scanner.toml";

/** The keys a record may hold. */
const RECORD_KEYS = ["id", "reason", "ignoreUntil"];

/** A GHSA id, as the advisory database writes one. */
const GHSA = /^GHSA(?:-[0-9a-z]{4}){3}$/;

/**
 * The records of `scripts/osv-scanner.toml` under `root`, read closed.
 *
 * @param {string} root
 * @returns {{ id: string }[]}
 */
export function records(root) {
  let config;

  try {
    config = parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        readFileSync(join(root, SOURCE)),
      ),
    );
  } catch (error) {
    throw new Error(`${SOURCE}: ${error.message.split("\n")[0]}`);
  }

  const outside = Object.keys(config).filter((key) => key !== "IgnoredVulns");

  if (outside.length > 0) {
    throw new Error(
      `${SOURCE}: ${outside.join(", ")} — a key this does not read; it reads \`[[IgnoredVulns]]\` alone`,
    );
  }

  const list = config.IgnoredVulns ?? [];

  if (!Array.isArray(list)) {
    throw new Error(`${SOURCE}: IgnoredVulns is not an array of tables`);
  }

  const seen = new Set();

  return list.map((record, index) => {
    const id =
      typeof record?.id === "string" && record.id !== "" ? record.id : "";
    const name = `${SOURCE}: record ${index + 1}${id === "" ? "" : ` (${id})`}`;

    if (
      record === null ||
      typeof record !== "object" ||
      Array.isArray(record)
    ) {
      throw new Error(`${name} is not a table`);
    }
    for (const key of Object.keys(record)) {
      if (!RECORD_KEYS.includes(key)) {
        throw new Error(`${name}: "${key}", a key this does not read`);
      }
    }
    if (typeof record.id !== "string" || record.id === "") {
      throw new Error(`${name}: no \`id\` string`);
    }
    if (record.reason !== undefined && typeof record.reason !== "string") {
      throw new Error(`${name}: \`reason\` is not a string`);
    }
    if (
      record.ignoreUntil !== undefined &&
      !(record.ignoreUntil instanceof TomlDate && record.ignoreUntil.isDate())
    ) {
      throw new Error(
        `${name}: \`ignoreUntil\` is not a TOML local date such as 2026-11-09`,
      );
    }
    if (record.id.startsWith("GHSA-") && !GHSA.test(record.id)) {
      throw new Error(
        `${name}: not a GHSA id of the form GHSA-xxxx-xxxx-xxxx, which YAML would read as itself`,
      );
    }
    if (seen.has(record.id)) {
      throw new Error(`${name}: an \`id\` an earlier record holds`);
    }
    seen.add(record.id);

    return record;
  });
}

/**
 * The region: `allow-ghsas` with the `GHSA-*` ids of the records, in their
 * order, as a YAML list — an empty one when there is none.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function render(root) {
  const ids = records(root)
    .map((record) => record.id)
    .filter((id) => id.startsWith("GHSA-"));

  return ids.length === 0
    ? ["allow-ghsas: []"]
    : ["allow-ghsas:", ...ids.map((id) => `  - ${id}`)];
}
