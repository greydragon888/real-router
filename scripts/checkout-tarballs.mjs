#!/usr/bin/env node
// checkout-tarballs.mjs — puts THIS checkout's @real-router/* packages into a
// workspace that declares them as npm versions (`examples/`).
//
//   node scripts/checkout-tarballs.mjs <workspace> [--no-bundle]
//
// 1. bundles every public package (turbo, so an unchanged package is a cache hit);
// 2. packs each one into `node_modules/.cache/checkout-tarballs/` under a name
//    that carries a hash of the tarball: `real-router-<name>-<version>-<hash>.tgz`;
// 3. installs the set into <workspace>. Its `.pnpmfile.mjs` turns `RR_TARBALLS`
//    into `overrides` on every @real-router/* edge, peers included;
// 4. puts the committed lockfile back.
//
// Back to the npm versions: `pnpm install --frozen-lockfile` in <workspace>.
//
// ⚠ The install keeps the lockfile ON and restores it afterwards. With
// `--config.lockfile=false` pnpm re-resolves every third-party dependency from
// the registry, not only @real-router/*: measured, a `dequal` locked at 2.0.0
// under `^2.0.0` came back as 2.0.3.
//
// ⚠ The hash is in the name because pnpm does not pick up new content under a
// tarball name it has already installed.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the tarballs live between runs; inside node_modules, so never tracked. */
export const TARBALL_DIR = path.join(
  ROOT,
  "node_modules",
  ".cache",
  "checkout-tarballs",
);

/**
 * The public packages under `<root>/packages`.
 *
 * @param {string} root repository root
 * @returns {{ name: string, version: string, dir: string }[]}
 */
export function publicPackages(root) {
  const base = path.join(root, "packages");

  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name))
    .filter((dir) => existsSync(path.join(dir, "package.json")))
    .map((dir) => ({
      dir,
      manifest: JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")),
    }))
    .filter(({ manifest }) => manifest.private !== true)
    .map(({ dir, manifest }) => ({
      name: manifest.name,
      version: manifest.version,
      dir,
    }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * The file name the workspace's `.pnpmfile.mjs` reads back as `@real-router/<name>`.
 *
 * @param {string} name package name, `@real-router/<name>`
 * @param {string} version package version
 * @param {string} hash hex digest of the tarball
 */
export function tarballName(name, version, hash) {
  const bare = name.replace(/^@real-router\//, "");

  return `real-router-${bare}-${version}-${hash}.tgz`;
}

/** First 12 hex characters of the file's sha256. */
export function contentHash(file) {
  return createHash("sha256")
    .update(readFileSync(file))
    .digest("hex")
    .slice(0, 12);
}

/**
 * Packs every package into `outDir`, which is emptied first: the pnpmfile maps
 * each tarball it finds to its package, so a stale one would compete.
 *
 * @param {{ name: string, version: string, dir: string }[]} packages
 * @param {string} outDir
 * @param {(cmd: string, args: string[], opts: object) => unknown} run
 * @returns {string[]} the tarball file names, sorted
 */
export function packAll(packages, outDir, run = execFileSync) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const names = [];

  for (const pkg of packages) {
    const staging = mkdtempSync(path.join(tmpdir(), "checkout-tarball-"));

    try {
      run("pnpm", ["pack", "--pack-destination", staging], {
        cwd: pkg.dir,
        stdio: "ignore",
      });

      const produced = readdirSync(staging).filter((f) => f.endsWith(".tgz"));

      if (produced.length !== 1) {
        throw new Error(
          `checkout-tarballs: \`pnpm pack\` in ${pkg.dir} produced ${produced.length} tarballs`,
        );
      }

      const from = path.join(staging, produced[0]);
      const name = tarballName(pkg.name, pkg.version, contentHash(from));

      renameSync(from, path.join(outDir, name));
      names.push(name);
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }

  return names.toSorted();
}

/**
 * Installs the tarballs in `tarballDir` into `workspace` and restores the
 * lockfile the install rewrote — on success, on failure and on Ctrl-C.
 *
 * @param {string} workspace directory holding `pnpm-workspace.yaml`
 * @param {string} tarballDir
 * @param {(cmd: string, args: string[], opts: object) => unknown} run
 */
export function installTarballs(workspace, tarballDir, run = execFileSync) {
  const lockfile = path.join(workspace, "pnpm-lock.yaml");
  const committed = readFileSync(lockfile);
  // A listener keeps Node from dying on the signal before `finally` runs; the
  // child gets the same signal and `run` throws.
  const ignore = () => {};

  process.on("SIGINT", ignore);
  process.on("SIGTERM", ignore);

  try {
    run("pnpm", ["install", "--no-frozen-lockfile"], {
      cwd: workspace,
      stdio: "inherit",
      env: { ...process.env, RR_TARBALLS: tarballDir },
    });
  } finally {
    writeFileSync(lockfile, committed);
    process.off("SIGINT", ignore);
    process.off("SIGTERM", ignore);
  }
}

export function main(argv, run = execFileSync) {
  const bundle = !argv.includes("--no-bundle");
  const [target] = argv.filter((arg) => !arg.startsWith("--"));

  if (!target) {
    throw new Error("usage: checkout-tarballs.mjs <workspace> [--no-bundle]");
  }

  const workspace = path.resolve(target);

  if (!existsSync(path.join(workspace, "pnpm-workspace.yaml"))) {
    throw new Error(`checkout-tarballs: ${workspace} is not a pnpm workspace`);
  }

  if (bundle) {
    run(
      "pnpm",
      [
        "turbo",
        "run",
        "bundle",
        "--filter=./packages/*",
        "--output-logs=errors-only",
      ],
      { cwd: ROOT, stdio: "inherit" },
    );
  }

  const names = packAll(publicPackages(ROOT), TARBALL_DIR, run);

  process.stdout.write(
    `checkout-tarballs: ${names.length} tarballs in ${path.relative(ROOT, TARBALL_DIR)}\n`,
  );
  installTarballs(workspace, TARBALL_DIR, run);
}

if (import.meta.main) {
  main(process.argv.slice(2));
}
