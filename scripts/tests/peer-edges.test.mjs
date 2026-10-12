// peer-edges.test.mjs — every `@real-router/*` peer of a package has an entry
// of the same name in its `dependencies` or `devDependencies`.
//
// Run:  node --test scripts/tests/peer-edges.test.mjs
//
// turbo builds its task graph from `dependencies`, `devDependencies` and
// `optionalDependencies`, never from `peerDependencies`. A package whose only
// entry for a `@real-router/*` package is the peer is out of that package's
// graph, and turbo replays its results computed against an older copy of it.
//
// This file holds that the entry is there; syncpack holds the form of a string
// entry. `syncpack.config.mjs` pins `@real-router/*` to `workspace:^` in
// `dependencies` and `devDependencies`, bans it from `optionalDependencies`,
// and bans `@real-router/core` from the `dependencies` of a `@real-router/*`
// package; the cells below run syncpack with that config on fixtures. A value
// that is not a string syncpack passes in silence, and turbo refuses the
// manifest. The check reads no form of the entry.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { packages } from "../repo-model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SYNCPACK = join(ROOT, "node_modules", ".bin", "syncpack");
const CONFIG = join(ROOT, "syncpack.config.mjs");

/** @param {unknown} value */
const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The `@real-router/*` peers of the packages under `root`, and those with no
 * entry of the same name in `dependencies` or `devDependencies`, each as
 * `<dir>: <name>`. A manifest that does not parse, is not an object, or holds
 * `peerDependencies`, `dependencies` or `devDependencies` as anything but an
 * object fails the read.
 *
 * @param {string} root
 * @returns {{ peers: string[], missing: string[] }}
 */
function peerEdges(root) {
  const peers = [];
  const missing = [];

  for (const { dir } of packages(root)) {
    const file = `${dir}/package.json`;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(root, file), "utf8"));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
    if (!isObject(manifest)) {
      throw new Error(`${file}: the manifest is not an object`);
    }
    const section = (key) => {
      if (!Object.hasOwn(manifest, key)) return {};
      if (!isObject(manifest[key])) {
        throw new Error(`${file}: ${key} is not an object`);
      }
      return manifest[key];
    };
    const [peer, prod, dev] = [
      "peerDependencies",
      "dependencies",
      "devDependencies",
    ].map(section);

    for (const name of Object.keys(peer)) {
      if (!name.startsWith("@real-router/")) continue;
      peers.push(`${dir}: ${name}`);
      if (!Object.hasOwn(prod, name) && !Object.hasOwn(dev, name)) {
        missing.push(`${dir}: ${name}`);
      }
    }
  }

  return { peers, missing };
}

/**
 * Builds `files` under a fresh directory — a string as it is, anything else as
 * JSON — runs `body` on it, removes it.
 *
 * @template T
 * @param {Record<string, unknown>} files
 * @param {(root: string) => T} body
 * @returns {T}
 */
function withTree(files, body) {
  const root = mkdtempSync(join(tmpdir(), "peer-edges-"));

  try {
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(
        join(root, file),
        typeof content === "string" ? content : `${JSON.stringify(content)}\n`,
      );
    }
    return body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const CORE = { "@real-router/core": "workspace:>=0.1.0" };

test("each @real-router/* peer under packages/ has an entry turbo reads", () => {
  const { peers, missing } = peerEdges(ROOT);

  assert.ok(peers.length > 0, "no @real-router/* peer read under packages/");
  assert.deepEqual(
    missing,
    [],
    'a peer turbo does not see: add it to devDependencies as "workspace:^"',
  );
});

test("a peer is red without an entry in dependencies or devDependencies", () => {
  const fixture = {
    "packages/core/package.json": { name: "@real-router/core" },
    "packages/in-dev/package.json": {
      name: "@fx/in-dev",
      peerDependencies: CORE,
      devDependencies: { "@real-router/core": "workspace:^" },
    },
    "packages/in-prod/package.json": {
      name: "@fx/in-prod",
      peerDependencies: CORE,
      dependencies: { "@real-router/core": "workspace:^" },
    },
    "packages/no-peer/package.json": {
      name: "@fx/no-peer",
      dependencies: { "@real-router/core": "workspace:^" },
    },
    "packages/peer-only/package.json": {
      name: "@fx/peer-only",
      peerDependencies: CORE,
    },
    "packages/in-optional/package.json": {
      name: "@fx/in-optional",
      peerDependencies: CORE,
      optionalDependencies: { "@real-router/core": "workspace:^" },
    },
    "packages/another-entry/package.json": {
      name: "@fx/another-entry",
      peerDependencies: CORE,
      devDependencies: { "@real-router/sources": "workspace:^" },
    },
    "packages/external-peer/package.json": {
      name: "@fx/external-peer",
      peerDependencies: { react: ">=18.0.0" },
    },
  };

  assert.deepEqual(
    withTree(fixture, (root) => peerEdges(root)),
    {
      peers: [
        "packages/another-entry: @real-router/core",
        "packages/in-dev: @real-router/core",
        "packages/in-optional: @real-router/core",
        "packages/in-prod: @real-router/core",
        "packages/peer-only: @real-router/core",
      ],
      missing: [
        "packages/another-entry: @real-router/core",
        "packages/in-optional: @real-router/core",
        "packages/peer-only: @real-router/core",
      ],
    },
  );
});

test("a manifest the check cannot read fails it, naming the file", () => {
  for (const [shape, manifest] of [
    ["does not parse", "{\n"],
    ["is a list", "[]\n"],
    ["peerDependencies is a list", { peerDependencies: ["@real-router/core"] }],
    ["devDependencies is a string", { devDependencies: "workspace:^" }],
    ["dependencies is null", { dependencies: null }],
  ]) {
    withTree({ "packages/a/package.json": manifest }, (root) => {
      assert.throws(
        () => peerEdges(root),
        (error) => error.message.startsWith("packages/a/package.json: "),
        shape,
      );
    });
  }
});

/** A peer and its `workspace:^` entry: the shape of each package with a peer. */
const SHAPE = {
  "package.json": { name: "fixture", private: true },
  "packages/core/package.json": {
    name: "@real-router/core",
    version: "0.1.0",
  },
  "packages/sources/package.json": {
    name: "@real-router/sources",
    version: "0.1.0",
  },
  "packages/a/package.json": {
    name: "@real-router/a",
    version: "0.1.0",
    peerDependencies: CORE,
    devDependencies: { "@real-router/core": "workspace:^" },
  },
};

/** `SHAPE`, with `fields` set in the manifest of `packages/a`. */
const shapeWith = (fields) => ({
  ...SHAPE,
  "packages/a/package.json": { ...SHAPE["packages/a/package.json"], ...fields },
});

/**
 * What syncpack says of `files` under the repository's `syncpack.config.mjs`:
 * the exit code of `syncpack lint`, the command of `lint:deps`, and the status
 * `syncpack json` gives each instance in `packages/a`, keyed
 * `<dependency> <type>`.
 *
 * @param {Record<string, unknown>} files
 * @returns {{ lint: number | null, a: Map<string, string> }}
 */
function syncpackSays(files) {
  assert.ok(existsSync(SYNCPACK), `no syncpack binary at ${SYNCPACK}`);

  return withTree(files, (root) => {
    const run = (command) =>
      spawnSync(SYNCPACK, [command, "--config", CONFIG, "--no-ansi"], {
        cwd: root,
        encoding: "utf8",
      });
    const lint = run("lint");
    assert.ok(
      lint.status === 0 || lint.status === 1,
      `syncpack lint: ${lint.status}\n${lint.stdout}\n${lint.stderr}`,
    );
    const json = run("json");
    assert.ok(
      json.status === 0 || json.status === 1,
      `syncpack json: ${json.status}\n${json.stderr}`,
    );

    const a = new Map();
    for (const line of json.stdout.split("\n")) {
      if (line === "") continue;
      const row = JSON.parse(line);
      if (!row.package.endsWith("/packages/a/package.json")) continue;
      const key = `${row.dependency} ${row.dependencyType}`;
      assert.ok(!a.has(key), `two instances of ${key}`);
      a.set(key, row.statusCode);
    }
    return { lint: lint.status, a };
  });
}

test("syncpack passes the shape of the repository's packages", () => {
  const { lint, a } = syncpackSays(SHAPE);

  assert.equal(lint, 0);
  assert.equal(a.get("@real-router/core dev"), "IsIdenticalToPin");
});

for (const form of [
  "workspace:^",
  "workspace:*",
  "workspace:../core",
  "workspace:@real-router/core@^0.1.0",
  "0.1.0",
  "^0.1.0",
]) {
  test(`syncpack bans @real-router/* in optionalDependencies as ${form}`, () => {
    const { lint, a } = syncpackSays(
      shapeWith({ optionalDependencies: { "@real-router/core": form } }),
    );

    assert.equal(a.get("@real-router/core optional"), "IsBanned");
    assert.equal(lint, 1);
  });
}

test("syncpack bans a @real-router/* name other than core in optionalDependencies", () => {
  const { lint, a } = syncpackSays(
    shapeWith({
      optionalDependencies: { "@real-router/sources": "workspace:^" },
    }),
  );

  assert.equal(a.get("@real-router/sources optional"), "IsBanned");
  assert.equal(lint, 1);
});

test("syncpack lets a third-party package stand in optionalDependencies", () => {
  const { lint, a } = syncpackSays(
    shapeWith({ optionalDependencies: { "left-pad": "1.3.0" } }),
  );

  assert.ok(a.has("left-pad optional"), "syncpack did not read the entry");
  assert.equal(lint, 0);
});

for (const form of [
  "workspace:@real-router/core@^0.1.0",
  "workspace:@real-router/sources@*",
  "workspace:../core",
]) {
  test(`syncpack holds devDependencies to workspace:^ against ${form}`, () => {
    const { lint, a } = syncpackSays(
      shapeWith({ devDependencies: { "@real-router/core": form } }),
    );

    assert.equal(a.get("@real-router/core dev"), "DiffersToPin");
    assert.equal(lint, 1);
  });
}

test("syncpack holds dependencies to workspace:^ against a version", () => {
  const { lint, a } = syncpackSays(
    shapeWith({ dependencies: { "@real-router/sources": "0.1.0" } }),
  );

  assert.equal(a.get("@real-router/sources prod"), "DiffersToPin");
  assert.equal(lint, 1);
});

test("syncpack bans core from the dependencies of a @real-router/* package beside its peer", () => {
  const { lint, a } = syncpackSays(
    shapeWith({ dependencies: { "@real-router/core": "workspace:^" } }),
  );

  assert.equal(a.get("@real-router/core prod"), "IsBanned");
  assert.equal(lint, 1);
});

test("syncpack bans core from the dependencies of a @real-router/* package without a peer", () => {
  const { lint, a } = syncpackSays({
    ...SHAPE,
    "packages/a/package.json": {
      name: "@real-router/a",
      version: "0.1.0",
      dependencies: { "@real-router/core": "workspace:^" },
    },
  });

  assert.equal(a.get("@real-router/core prod"), "IsBanned");
  assert.equal(lint, 1);
});

test("syncpack lets a package outside @real-router/* keep core in dependencies", () => {
  const { lint, a } = syncpackSays({
    ...SHAPE,
    "packages/a/package.json": {
      name: "fixture-harness",
      version: "0.1.0",
      private: true,
      dependencies: { "@real-router/core": "workspace:^" },
    },
  });

  assert.equal(a.get("@real-router/core prod"), "IsIdenticalToPin");
  assert.equal(lint, 0);
});

test("syncpack lets a @real-router/* package keep another @real-router/* package in dependencies", () => {
  const { lint, a } = syncpackSays(
    shapeWith({ dependencies: { "@real-router/sources": "workspace:^" } }),
  );

  assert.equal(a.get("@real-router/sources prod"), "IsIdenticalToPin");
  assert.equal(lint, 0);
});
