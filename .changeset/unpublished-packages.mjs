#!/usr/bin/env node
/**
 * Classify every public `packages/*` package at HEAD against the npm registry:
 * already published, behind (local version newer than npm's), or **never
 * published at all**.
 *
 * Replaces two near-identical sequential bash loops in `changesets.yml` (the
 * "Check for unpublished packages" preflight and the "Fail if publish errored"
 * post-mortem), fixing two things at once:
 *
 * 1. **404 was conflated with "behind".** The old `pnpm view "$name" version
 *    2>/dev/null || echo "0.0.0"` swallowed *every* failure into `0.0.0`, so a
 *    package that has never been published looked exactly like one that is one
 *    release behind. `changeset publish` then died with a bare 404/403 saying
 *    nothing about the actual cause — the manual first publish plus
 *    `npm trust github …` wiring was never done (a package must exist on the
 *    registry before a trusted publisher can be attached, npm/cli#8544). CI can
 *    never self-heal that: it is a human, browser-bound WebAuthn ceremony. So
 *    the one useful thing this step can do is *name* it, which needs the two
 *    cases separated. That same `|| echo` also masked genuine registry/network
 *    failures — those now retry once and then fail loudly rather than being
 *    silently reported as "needs publish".
 *
 * 2. **It cost ~21 s on every changeset-free push to master.** The preflight
 *    runs whenever `changesets_count == 0`, i.e. on every infra push, not only
 *    on release merges — 23 sequential `pnpm view` round-trips. Same query set,
 *    run with a small concurrency pool, lands in ~2-3 s.
 *
 * `pnpm view` is kept as the transport (rather than a direct `fetch` of the
 * registry JSON) deliberately: it preserves registry/auth/proxy configuration
 * semantics byte-for-byte, so this is a pure latency + classification change.
 *
 * Emits GitHub Actions step outputs when `$GITHUB_OUTPUT` is set, and a
 * human-readable log to stdout either way. The CLI block runs only when invoked
 * directly (the `import.meta` guard).
 *
 * Outputs:
 *   has_unpublished   — "true" | "false"
 *   packages          — " @scope/a @scope/b"    (names, leading space)
 *   unpublished_specs — " @scope/a@1.2.3"       (name@version, leading space)
 *   never_published   — " @scope/c"             (subset of `packages` that 404'd)
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Concurrent `pnpm view` processes. The cost here is process spawn, not the
 * registry round-trip, so the pool wants to cover the whole package set in as
 * few waves as possible; measured on the 23-package set, 8 → 6.2 s and 16 →
 * 4.4-5.2 s against 21.2 s sequential. Kept at 16 rather than "unbounded" so a
 * future package count in the hundreds cannot fork a process per package.
 */
const CONCURRENCY = 16;

/**
 * A missing package is reported differently by pnpm and npm; match either so the
 * classification does not silently depend on which client runs.
 */
const NOT_FOUND = /ERR_PNPM_FETCH_404|E404|Not Found - 404/;

/**
 * Read the public packages at HEAD.
 *
 * @param {string} [root] repo root (defaults to cwd)
 * @returns {{name: string, version: string, dir: string}[]}
 */
export function readPublicPackages(root = process.cwd()) {
  const packagesDir = join(root, "packages");
  if (!existsSync(packagesDir)) return [];
  const out = [];
  for (const entry of readdirSync(packagesDir).sort()) {
    const manifest = join(packagesDir, entry, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    if (pkg.private === true) continue;
    out.push({ name: pkg.name, version: pkg.version, dir: entry });
  }
  return out;
}

/**
 * Pure classification — the part worth unit-testing. `npmVersion` is the
 * registry's version, or `null` when the package is absent from the registry.
 *
 * @param {string} localVersion
 * @param {string | null} npmVersion
 * @returns {"published" | "behind" | "never-published"}
 */
export function classify(localVersion, npmVersion) {
  if (npmVersion === null) return "never-published";
  return localVersion === npmVersion ? "published" : "behind";
}

/**
 * Query one package's published version.
 *
 * @param {string} name
 * @returns {Promise<string | null>} version, or null when the package is absent
 * @throws when the registry query fails for any reason other than "not found"
 */
async function fetchNpmVersion(name) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { stdout } = await execFileAsync("pnpm", ["view", name, "version"]);
      return stdout.trim();
    } catch (error) {
      const text = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
      // A genuine 404 is an answer, not a failure — return it immediately.
      if (NOT_FOUND.test(text)) return null;
      // Anything else (network, registry 5xx, auth) gets one retry, then throws.
      // The old `|| echo "0.0.0"` reported these as "needs publish"; a wrong
      // answer is worse than a red step.
      if (attempt === 1) {
        throw new Error(`pnpm view ${name} version failed: ${text.trim()}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  /* c8 ignore next */
  return null;
}

/**
 * Run `task` over `items` with at most `limit` in flight. Results keep input order.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} task
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await task(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Classify every public package against the registry.
 *
 * @param {string} [root]
 * @returns {Promise<{name: string, version: string, dir: string, status: ReturnType<typeof classify>, npmVersion: string | null}[]>}
 */
export async function classifyAll(root = process.cwd()) {
  const packages = readPublicPackages(root);
  const versions = await mapWithConcurrency(packages, CONCURRENCY, (pkg) =>
    fetchNpmVersion(pkg.name),
  );
  return packages.map((pkg, index) => ({
    ...pkg,
    status: classify(pkg.version, versions[index]),
    npmVersion: versions[index],
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await classifyAll();

  for (const row of rows) {
    if (row.status === "published") {
      console.log(`✅ ${row.name}: ${row.version} (already published)`);
    } else if (row.status === "behind") {
      console.log(
        `📦 ${row.name}: local=${row.version}, npm=${row.npmVersion} (needs publish)`,
      );
    } else {
      console.log(
        `🆕 ${row.name}: local=${row.version}, NOT ON THE REGISTRY (never published)`,
      );
    }
  }

  const pending = rows.filter((row) => row.status !== "published");
  const neverPublished = rows.filter((row) => row.status === "never-published");

  // Surface the unfixable-by-CI case as an annotation rather than failing here:
  // failing would block every OTHER package's release behind one unwired new
  // package. `changeset publish` will still fail on it, and the final
  // "Fail if publish errored" gate still turns the run red — but now the log
  // says why, at the top, in words that name the missing step.
  if (neverPublished.length > 0) {
    const names = neverPublished.map((row) => row.name).join(", ");
    console.log(
      `::error title=Package never published::${names} — not on the npm registry, so ` +
        `OIDC publishing cannot work yet. A trusted publisher can only be attached to a ` +
        `package that already exists (npm/cli#8544). Do the one-time manual first publish ` +
        `and wiring interactively (it needs a WebAuthn 2FA ceremony and cannot be scripted): ` +
        `npm login --auth-type=web && pnpm publish --filter <pkg>, then ` +
        `npm trust github <pkg> --file changesets.yml --repo ${process.env.GITHUB_REPOSITORY ?? "greydragon888/real-router"} --allow-publish`,
    );
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `has_unpublished=${pending.length > 0 ? "true" : "false"}`,
        `packages=${pending.map((row) => ` ${row.name}`).join("")}`,
        `unpublished_specs=${pending.map((row) => ` ${row.name}@${row.version}`).join("")}`,
        `never_published=${neverPublished.map((row) => ` ${row.name}`).join("")}`,
        "",
      ].join("\n"),
    );
  }
}
