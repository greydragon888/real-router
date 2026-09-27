// checkout-tarballs.test.mjs — the checkout's packages reach a workspace that
// declares npm versions, and the workspace's lockfile survives the trip.
//
// Run:  node --test scripts/tests/checkout-tarballs.test.mjs

import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  installTarballs,
  packAll,
  publicPackages,
  tarballName,
} from "../checkout-tarballs.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const pnpmfile = path.join(repoRoot, "examples", ".pnpmfile.mjs");

test("publicPackages: every package under packages/ that is not private", () => {
  const found = publicPackages(repoRoot);
  const names = found.map((pkg) => pkg.name);

  assert.ok(names.includes("@real-router/core"));
  assert.ok(names.every((name) => name.startsWith("@real-router/")));
  assert.deepEqual(
    names,
    names.toSorted((a, b) => a.localeCompare(b)),
  );
  for (const pkg of found) {
    const manifest = JSON.parse(
      readFileSync(path.join(pkg.dir, "package.json"), "utf8"),
    );

    assert.notEqual(manifest.private, true, pkg.name);
  }
});

test("every tarball name reads back as its package through the examples pnpmfile", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "checkout-tarballs-names-"));
  const previous = process.env.RR_TARBALLS;

  try {
    const packages = publicPackages(repoRoot);

    for (const pkg of packages) {
      writeFileSync(
        path.join(dir, tarballName(pkg.name, pkg.version, "0123abcd4567")),
        "",
      );
    }
    process.env.RR_TARBALLS = dir;

    // A fresh module instance: the pnpmfile reads RR_TARBALLS when it loads.
    const { hooks } = await import(
      `${pathToFileURL(pnpmfile).href}?names=${Date.now()}`
    );
    const config = hooks.updateConfig({});

    assert.deepEqual(
      Object.keys(config.overrides).toSorted(),
      packages.map((pkg) => pkg.name).toSorted(),
    );
    assert.deepEqual(config.peerDependencyRules.allowAny, ["@real-router/*"]);
  } finally {
    if (previous === undefined) delete process.env.RR_TARBALLS;
    else process.env.RR_TARBALLS = previous;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("without RR_TARBALLS the pnpmfile leaves the config as it found it", async () => {
  const previous = process.env.RR_TARBALLS;

  delete process.env.RR_TARBALLS;
  try {
    const { hooks } = await import(
      `${pathToFileURL(pnpmfile).href}?inert=${Date.now()}`
    );
    const config = { overrides: { vite: ">=8.2.2 <9" } };

    assert.deepEqual(hooks.updateConfig(config), {
      overrides: { vite: ">=8.2.2 <9" },
    });
  } finally {
    if (previous !== undefined) process.env.RR_TARBALLS = previous;
  }
});

test("packAll: one tarball per package, a hash in its name, stale ones gone", () => {
  const out = mkdtempSync(path.join(tmpdir(), "checkout-tarballs-out-"));

  try {
    writeFileSync(path.join(out, "real-router-core-0.1.0-deadbeef.tgz"), "old");

    // `pnpm pack --pack-destination <dir>` writes `real-router-<name>-<v>.tgz`.
    const fakePack = (_cmd, args, { cwd }) => {
      const destination = args[args.indexOf("--pack-destination") + 1];
      const bare = path.basename(cwd);

      writeFileSync(
        path.join(destination, `real-router-${bare}-1.2.3.tgz`),
        `bytes of ${bare}`,
      );
    };
    const names = packAll(
      [
        { name: "@real-router/core", version: "1.2.3", dir: "/x/core" },
        { name: "@real-router/ssr-utils", version: "1.2.3", dir: "/x/ssr-utils" },
      ],
      out,
      fakePack,
    );

    assert.equal(names.length, 2);
    assert.match(names[0], /^real-router-core-1\.2\.3-[0-9a-f]{12}\.tgz$/);
    assert.match(names[1], /^real-router-ssr-utils-1\.2\.3-[0-9a-f]{12}\.tgz$/);
    assert.deepEqual(readdirSync(out).toSorted(), names);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test("installTarballs puts the committed lockfile back, on success and on failure", () => {
  const workspace = mkdtempSync(path.join(tmpdir(), "checkout-tarballs-ws-"));
  const lockfile = path.join(workspace, "pnpm-lock.yaml");
  const committed = "lockfileVersion: '9.0'\n";

  try {
    writeFileSync(lockfile, committed);

    const seen = [];
    const rewrite = (cmd, args, opts) => {
      seen.push({ cmd, args, env: opts.env.RR_TARBALLS, cwd: opts.cwd });
      writeFileSync(lockfile, "rewritten by the install\n");
    };

    installTarballs(workspace, "/tarballs", rewrite);
    assert.equal(readFileSync(lockfile, "utf8"), committed);
    assert.deepEqual(seen, [
      {
        cmd: "pnpm",
        args: ["install", "--no-frozen-lockfile"],
        env: "/tarballs",
        cwd: workspace,
      },
    ]);

    const fail = () => {
      writeFileSync(lockfile, "half-written\n");
      throw new Error("install failed");
    };

    assert.throws(
      () => installTarballs(workspace, "/tarballs", fail),
      /install failed/,
    );
    assert.equal(readFileSync(lockfile, "utf8"), committed);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
