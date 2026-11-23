// env-read-census.test.mjs — the code outside the UI layer reads the
// environment only where ARCHITECTURE.md › Invariants › Guards & Plugins, "A
// plugin is isomorphic by default", lets it.
//
// Run:  node --test scripts/tests/env-read-census.test.mjs
//
// Scope. The code roots are `packages/<pkg>/src` and `shared/<dir>`, and check
// 6 of `scripts/check-coverage-scope.mjs` holds that there are no others. The
// UI layer — the framework adapters and `shared/dom-utils` — is outside the
// census. Inside it, an environment-specific package and the shared layers of
// those packages are allowed whole. Every other package and shared dir, one
// added later among them, is isomorphic: it reads the environment only in the
// places NAMED lists.
//
// A read is the identifier `globalThis` in any position, or a name of NAMES in
// any position but a key: a property access `x.history`, an object or class
// member, an enum member, the key of a destructuring. A comment, a string and a
// type position are not reads. An alias, a cast, an element access and a
// function that returns `globalThis` all write the identifier, so the census
// sees them. A binding that takes a name of NAMES is a read too, as the census
// does not resolve scopes. A global under a name outside NAMES (`self`,
// `addEventListener`) it does not see. Nor does it see the host reached through
// a module under another name (`import { env } from "node:process"`),
// `import.meta`, or an environment read that isomorphic code imports: from an
// environment-specific package, or from a shared layer by a relative path.
//
// A symlink under the `src/` of an isomorphic package is refused: a shared dir
// enters a package through one, and the census does not follow it. A Svelte or
// Vue file in isomorphic code is refused as well: the TypeScript parser cannot
// read it.
//
// The files are git's: tracked, and untracked but not ignored.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The environment's globals the census reads by name, beside `globalThis`. */
const NAMES = [
  "window",
  "document",
  "navigator",
  "location",
  "history",
  "localStorage",
  "sessionStorage",
  "process",
  "Deno",
  "Bun",
  "console",
];

const GLOBAL_THIS = "globalThis";

/** The framework adapters: the packages of the UI layer. */
const UI_PACKAGES = ["angular", "preact", "react", "solid", "svelte", "vue"];

/** The shared dir of the UI layer. */
const UI_SHARED = ["dom-utils"];

/**
 * The environment-specific packages. The work of each is an environment API —
 * the URL and its history, DOM events, the host console — or server rendering
 * and hydration. A package joins this list by a design decision about its work,
 * not to turn a red census green.
 */
const ENV_PACKAGES = [
  "browser-plugin",
  "hash-plugin",
  "navigation-plugin",
  "preload-plugin",
  "logger-plugin",
  "ssr-data-plugin",
  "rsc-server-plugin",
];

/** The shared layers of the environment-specific packages. */
const ENV_SHARED = ["browser-env", "ssr"];

/**
 * The places in isomorphic code that read the environment: a file, a name of
 * NAMES, and the member read off the name when the place allows that member
 * alone.
 */
const NAMED = [
  {
    file: "packages/core/src/utils/logger/RouterLogger.ts",
    name: "console",
    why: "the router's logger, the isomorphic implementation of output: isomorphic plugins write their diagnostics through it",
  },
  {
    file: "packages/rx/src/RxObservable.ts",
    name: "console",
    member: "error",
    why: "rx is not a plugin and its observable has no router: an error that reaches a subscriber without an `error` handler goes to the host console",
  },
];

const POLICY = {
  uiPackages: UI_PACKAGES,
  uiShared: UI_SHARED,
  envPackages: ENV_PACKAGES,
  envShared: ENV_SHARED,
  named: NAMED,
};

const SCRIPT_KINDS = new Map([
  [".js", ts.ScriptKind.JS],
  [".mjs", ts.ScriptKind.JS],
  [".cjs", ts.ScriptKind.JS],
  [".jsx", ts.ScriptKind.JSX],
  [".ts", ts.ScriptKind.TS],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
]);

/** Code the TypeScript parser cannot read. */
const COMPONENT_FILE = /\.(?:svelte|vue)$/u;

/** A path in a package's `src/`, or `src` itself. */
const SRC = /^packages\/[^/]+\/src(?:\/|$)/u;

/** A path in a shared dir. */
const SHARED = /^shared\/[^/]+\//u;

/** The parents whose `name` is a key, not a read. */
const KEY_PARENTS = new Set([
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
  ts.SyntaxKind.EnumMember,
]);

/** @param {ts.Identifier} node */
function isKey(node) {
  const { parent } = node;

  if (ts.isPropertyAccessExpression(parent)) return parent.name === node;
  if (ts.isBindingElement(parent)) return parent.propertyName === node;

  return KEY_PARENTS.has(parent.kind) && parent.name === node;
}

/** @param {ts.Identifier} node */
const isRead = (node) =>
  node.text === GLOBAL_THIS || (NAMES.includes(node.text) && !isKey(node));

/**
 * Whether everything under `node` is a type position. The expression of a
 * heritage clause is a type after `implements` and a value after a class's
 * `extends`; an interface's `extends` is inside the interface.
 *
 * @param {ts.Node} node
 */
function opensType(node) {
  if (ts.isExpressionWithTypeArguments(node)) {
    return (
      ts.isHeritageClause(node.parent) &&
      node.parent.token === ts.SyntaxKind.ImplementsKeyword
    );
  }

  return (
    ts.isTypeNode(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node)
  );
}

/**
 * The environment reads in one file: each with its line, the name, and the
 * member a property access reads off it.
 *
 * @param {string} file its path; the extension picks the parser's script kind
 * @param {string} text
 * @returns {{ file: string, line: number, name: string, member: string | undefined }[]}
 */
function readsOf(file, text) {
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    SCRIPT_KINDS.get(extname(file)),
  );
  const reads = [];
  const visit = (node, inType) => {
    const typed = inType || opensType(node);

    if (!typed && ts.isIdentifier(node) && isRead(node)) {
      const { parent } = node;

      reads.push({
        file,
        line:
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        name: node.text,
        member:
          ts.isPropertyAccessExpression(parent) && parent.expression === node
            ? parent.name.text
            : undefined,
      });
    }

    ts.forEachChild(node, (child) => visit(child, typed));
  };

  visit(source, false);

  return reads;
}

/**
 * The layer under `policy` of the package or shared dir `path` lies in, or
 * `undefined` outside the code roots.
 *
 * @param {string} path
 * @param {typeof POLICY} policy
 * @returns {"ui" | "env" | "isomorphic" | undefined}
 */
function layerOf(path, policy) {
  const name = path.split("/")[1];

  if (SRC.test(path)) {
    if (policy.uiPackages.includes(name)) return "ui";

    return policy.envPackages.includes(name) ? "env" : "isomorphic";
  }

  if (SHARED.test(path)) {
    if (policy.uiShared.includes(name)) return "ui";

    return policy.envShared.includes(name) ? "env" : "isomorphic";
  }

  return undefined;
}

/** @param {{ name: string, member?: string }} read */
const spell = ({ name, member }) =>
  member === undefined ? name : `${name}.${member}`;

/**
 * The census of the files under `packages/` and `shared/`.
 *
 * @param {{ path: string, link?: string, text?: string }[]} entries a symlink
 *   carries its target in `link`; a code file of a code root, its text
 * @param {typeof POLICY} policy
 */
function census(entries, policy) {
  const scanned = [];
  const reads = [];
  const links = [];
  const components = [];

  for (const { path, link, text } of entries) {
    if (layerOf(path, policy) !== "isomorphic") continue;

    if (link !== undefined) {
      links.push(`${path} -> ${link}`);
    } else if (COMPONENT_FILE.test(path)) {
      components.push(path);
    } else if (SCRIPT_KINDS.has(extname(path))) {
      scanned.push(path);
      reads.push(...readsOf(path, text));
    }
  }

  const allows = (place, read) =>
    place.file === read.file &&
    place.name === read.name &&
    (place.member === undefined || place.member === read.member);
  const packages = entries.flatMap(
    ({ path }) => /^packages\/([^/]+)\/package\.json$/u.exec(path)?.[1] ?? [],
  );
  const sharedDirs = entries.flatMap(({ path }) =>
    SHARED.test(path) ? [path.split("/")[1]] : [],
  );
  const isomorphic = packages.filter(
    (name) =>
      !policy.uiPackages.includes(name) && !policy.envPackages.includes(name),
  );

  return {
    scanned,
    offenders: reads
      .filter((read) => !policy.named.some((place) => allows(place, read)))
      .map((read) => `${read.file}:${read.line}: reads ${spell(read)}`),
    links,
    components,
    stale: [
      ...[...policy.uiPackages, ...policy.envPackages]
        .filter((name) => !packages.includes(name))
        .map((name) => `packages/${name}: no such package`),
      ...[...policy.uiShared, ...policy.envShared]
        .filter((name) => !sharedDirs.includes(name))
        .map((name) => `shared/${name}: no such shared dir`),
      ...policy.named
        .filter((place) => !reads.some((read) => allows(place, read)))
        .map((place) => `${place.file}: no read of ${spell(place)}`),
    ],
    unread: isomorphic
      .filter(
        (name) =>
          !scanned.some(
            (path) => SRC.test(path) && path.split("/")[1] === name,
          ),
      )
      .map((name) => `packages/${name}`),
  };
}

/** The files under `packages/` and `shared/` in the working tree, by git. */
function treeEntries() {
  const paths = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "packages",
      "shared",
    ],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
    .split("\0")
    .filter(Boolean);

  return paths.flatMap((path) => {
    const full = join(ROOT, path);
    const stat = lstatSync(full, { throwIfNoEntry: false });

    if (stat === undefined) return [];
    if (stat.isSymbolicLink()) return [{ path, link: readlinkSync(full) }];

    return [
      {
        path,
        text:
          SCRIPT_KINDS.has(extname(path)) &&
          (SRC.test(path) || SHARED.test(path))
            ? readFileSync(full, "utf8")
            : undefined,
      },
    ];
  });
}

const tree = treeEntries();
const result = census(tree, POLICY);

/** What a red census asks of a package that is not isomorphic. */
const NOT_ISOMORPHIC =
  "A framework adapter belongs in UI_PACKAGES, a shared dir of the UI layer in UI_SHARED. A package whose work is an environment API, or server rendering and hydration, joins ENV_PACKAGES, and its shared layer ENV_SHARED, by a design decision about that work.";

test("the code outside the UI layer reads the environment only where the rule lets it", () => {
  assert.deepEqual(
    result.offenders,
    [],
    `isomorphic code reads the environment here — leave what depends on the environment to the entry point, and write a plugin's diagnostics to the router's logger (\`PluginApi.logger\`). ${NOT_ISOMORPHIC}\n${result.offenders.join("\n")}`,
  );
});

test("no isomorphic package links a shared dir", () => {
  assert.deepEqual(
    result.links,
    [],
    `a symlink under the src/ of an isomorphic package — a shared layer does not enter isomorphic code. ${NOT_ISOMORPHIC}\n${result.links.join("\n")}`,
  );
});

test("no Svelte or Vue file sits in isomorphic code", () => {
  assert.deepEqual(
    result.components,
    [],
    `the census cannot read these. ${NOT_ISOMORPHIC}\n${result.components.join("\n")}`,
  );
});

test("every package, shared dir and place the census names is on the tree", () => {
  assert.deepEqual(
    result.stale,
    [],
    `stale entries:\n${result.stale.join("\n")}`,
  );
});

test("the census reads the code of every isomorphic package", () => {
  assert.ok(result.scanned.length > 0, "the census read no file");
  assert.deepEqual(
    result.unread,
    [],
    `the census read no code of:\n${result.unread.join("\n")}`,
  );
});

test("CONTROL — preload-plugin as an isomorphic package is red", () => {
  const { offenders } = census(tree, {
    ...POLICY,
    envPackages: ENV_PACKAGES.filter((name) => name !== "preload-plugin"),
  });

  assert.ok(
    offenders.some((offender) =>
      offender.startsWith("packages/preload-plugin/src/"),
    ),
    offenders.join("\n"),
  );
});

test("CONTROL — ssr-data-plugin as an isomorphic package is red by its symlink", () => {
  const { links } = census(tree, {
    ...POLICY,
    envPackages: ENV_PACKAGES.filter((name) => name !== "ssr-data-plugin"),
  });

  assert.ok(
    links.includes(
      "packages/ssr-data-plugin/src/shared-ssr -> ../../../shared/ssr",
    ),
    links.join("\n"),
  );
});

test("CONTROL — shared/ssr as an isomorphic dir is red", () => {
  const { offenders } = census(tree, {
    ...POLICY,
    envShared: ENV_SHARED.filter((name) => name !== "ssr"),
  });

  assert.ok(
    offenders.some((offender) => offender.startsWith("shared/ssr/")),
    offenders.join("\n"),
  );
});

test("CONTROL — RxObservable.ts outside the named places is red", () => {
  const { offenders } = census(tree, {
    ...POLICY,
    named: NAMED.filter(
      (place) => place.file !== "packages/rx/src/RxObservable.ts",
    ),
  });

  assert.ok(
    offenders.some((offender) =>
      offender.startsWith("packages/rx/src/RxObservable.ts:"),
    ),
    offenders.join("\n"),
  );
});

/** The names `readsOf` finds in `code`, read as a `.ts` file. */
const namesIn = (code) => readsOf("x.ts", code).map(spell);

test("fixture: each name under typeof, a member access and an alias is a read", () => {
  // The rule's own list, written out: a loop over NAMES would pass with a name
  // dropped from it.
  const rule = [
    "window",
    "document",
    "navigator",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
    "process",
    "Deno",
    "Bun",
    "console",
  ];

  assert.deepEqual(NAMES, rule);

  for (const name of [...rule, "globalThis"]) {
    assert.deepEqual(
      namesIn(`typeof ${name};\n${name}.x;\nconst a = ${name};\n`),
      [name, `${name}.x`, name],
      name,
    );
  }
});

test("fixture: the named places are written out", () => {
  // Written out: `RxObservable.ts` reads only `console.error`, so its place
  // without `member` would allow every member of `console` and still pass every
  // cell that reads the tree.
  assert.deepEqual(
    NAMED.map((place) => `${place.file} ${spell(place)}`),
    [
      "packages/core/src/utils/logger/RouterLogger.ts console",
      "packages/rx/src/RxObservable.ts console.error",
    ],
  );
});

test("fixture: globalThis under a cast, an element access, `in` and a return is a read", () => {
  assert.deepEqual(
    namesIn(
      [
        "(globalThis as unknown as { y: number }).y;",
        'globalThis["window"];',
        '"navigation" in globalThis;',
        "function g() { return globalThis; }",
        "x.globalThis;",
      ].join("\n"),
    ),
    [GLOBAL_THIS, GLOBAL_THIS, GLOBAL_THIS, GLOBAL_THIS, GLOBAL_THIS],
  );
});

test("fixture: a comment, a string, a template's text and a regex are not reads", () => {
  assert.deepEqual(
    namesIn(
      [
        "// window, document",
        "/* console.log(globalThis) */",
        '"history";',
        "`location ${1}`;",
        "/navigator/u;",
      ].join("\n"),
    ),
    [],
  );
});

test("fixture: a type position is not a read", () => {
  assert.deepEqual(
    namesIn(
      [
        "let a: typeof window;",
        "type T = typeof globalThis & { location: string };",
        "interface I extends Window { history: typeof history }",
        "function f(x: unknown): x is typeof document { return true; }",
        "class C implements globalThis.Marker {}",
        "const b = 1 as unknown as typeof console;",
        "type history = 1;",
        "interface location {}",
      ].join("\n"),
    ),
    [],
  );
});

test("fixture: a class's `extends` is a value", () => {
  assert.deepEqual(namesIn("class C extends window.EventTarget {}"), [
    "window.EventTarget",
  ]);
});

test("fixture: a key is not a read", () => {
  assert.deepEqual(
    namesIn(
      [
        "x.history;",
        "x?.location;",
        "({ history: 1 });",
        "({ history() {} });",
        "({ get location() { return 1; } });",
        "({ set document(v) {} });",
        "class C { history = 1; location() {} get document() { return 1; } set navigator(v) {} #console = 1; }",
        "enum E { console }",
        "const { location: here } = x;",
      ].join("\n"),
    ),
    [],
  );
});

test("fixture: a shorthand property, a binding and a value under a key are reads", () => {
  assert.deepEqual(
    namesIn(
      [
        "({ location });",
        "const { history } = x;",
        "function f(document) {}",
        "const console = 1;",
        "({ key: window });",
        "class C { field = navigator; }",
      ].join("\n"),
    ),
    ["location", "history", "document", "console", "window", "navigator"],
  );
});

test("fixture: the member is the name a property access reads off the read", () => {
  assert.deepEqual(
    readsOf("x.ts", "console.error(e);\nconsole[level](e);\n").map(
      ({ line, name, member }) => [line, name, member],
    ),
    [
      [1, "console", "error"],
      [2, "console", undefined],
    ],
  );
});

/** A package `name` with one source file `file` holding `code`. */
const pkg = (name, file, code) => [
  { path: `packages/${name}/package.json`, text: undefined },
  { path: `packages/${name}/src/${file}`, text: code },
];

test("fixture: isomorphic code is red, an environment-specific place is allowed, the UI layer is not read", () => {
  const { offenders } = census(
    [
      ...pkg("core", "a.ts", "console.log(1);\n"),
      ...pkg("browser-plugin", "a.ts", "window.x;\n"),
      ...pkg("react", "a.tsx", "document.title;\n"),
      ...pkg("rx", "RxObservable.ts", "console.error(e);\n"),
      { path: "shared/browser-env/a.ts", text: "history.go(1);\n" },
      { path: "shared/ssr/a.ts", text: "globalThis.x;\n" },
      { path: "shared/dom-utils/a.ts", text: "document.body;\n" },
      { path: "shared/new-dir/a.ts", text: "navigator.onLine;\n" },
    ],
    POLICY,
  );

  assert.deepEqual(offenders, [
    "packages/core/src/a.ts:1: reads console.log",
    "shared/new-dir/a.ts:1: reads navigator.onLine",
  ]);
});

test("fixture: a named place allows its name, and only its member when it names one", () => {
  const policy = {
    ...POLICY,
    named: [
      { file: "packages/core/src/log.ts", name: "console" },
      { file: "packages/rx/src/rx.ts", name: "console", member: "error" },
    ],
  };
  const { offenders } = census(
    [
      ...pkg(
        "core",
        "log.ts",
        "typeof console;\nconsole[level](m);\nwindow.x;\n",
      ),
      ...pkg("rx", "rx.ts", "console.error(e);\nconsole.log(e);\n"),
      ...pkg("sources", "log.ts", "console.warn(w);\n"),
    ],
    policy,
  );

  assert.deepEqual(offenders, [
    "packages/core/src/log.ts:3: reads window.x",
    "packages/rx/src/rx.ts:2: reads console.log",
    "packages/sources/src/log.ts:1: reads console.warn",
  ]);
});

test("fixture: a symlink under an isomorphic src/ is refused, under an environment-specific one it is not", () => {
  const { links } = census(
    [
      ...pkg("core", "a.ts", ""),
      { path: "packages/core/src/shared-ssr", link: "../../../shared/ssr" },
      {
        path: "packages/core/src/dom-utils",
        link: "../../../shared/dom-utils",
      },
      { path: "packages/rx/src", link: "../../shared/browser-env" },
      {
        path: "packages/ssr-data-plugin/src/shared-ssr",
        link: "../../../shared/ssr",
      },
      {
        path: "packages/react/src/dom-utils",
        link: "../../../shared/dom-utils",
      },
    ],
    POLICY,
  );

  assert.deepEqual(links, [
    "packages/core/src/shared-ssr -> ../../../shared/ssr",
    "packages/core/src/dom-utils -> ../../../shared/dom-utils",
    "packages/rx/src -> ../../shared/browser-env",
  ]);
});

test("fixture: a Svelte or Vue file in isomorphic code is refused", () => {
  const { components } = census(
    [
      ...pkg("core", "A.svelte", "<script>window.x</script>"),
      ...pkg("svelte", "B.svelte", "<script>window.x</script>"),
      { path: "shared/new-dir/C.vue", text: undefined },
    ],
    POLICY,
  );

  assert.deepEqual(components, [
    "packages/core/src/A.svelte",
    "shared/new-dir/C.vue",
  ]);
});

test("fixture: the census parses every code extension and skips other files", () => {
  // Written out: a loop over SCRIPT_KINDS would pass with one dropped from it.
  for (const extension of [
    ".js",
    ".mjs",
    ".cjs",
    ".jsx",
    ".ts",
    ".mts",
    ".cts",
    ".tsx",
  ]) {
    assert.deepEqual(
      census(pkg("core", `a${extension}`, "console.log(1);\n"), POLICY)
        .offenders,
      [`packages/core/src/a${extension}:1: reads console.log`],
      extension,
    );
  }
  assert.deepEqual(
    census(pkg("core", "README.md", "console.log(1)\n"), POLICY).offenders,
    [],
  );
});

test("fixture: an entry that names nothing on the tree is stale", () => {
  const { stale } = census(
    [
      ...pkg("core", "a.ts", "console.warn(1);\n"),
      ...pkg("browser-plugin", "log.ts", "console.log(1);\n"),
      { path: "shared/ssr/a.ts", text: "" },
    ],
    {
      uiPackages: ["react"],
      uiShared: ["dom-utils"],
      envPackages: ["browser-plugin", "gone-plugin"],
      envShared: ["ssr", "gone-env"],
      named: [
        { file: "packages/core/src/a.ts", name: "console" },
        { file: "packages/core/src/a.ts", name: "console", member: "log" },
        { file: "packages/browser-plugin/src/log.ts", name: "console" },
      ],
    },
  );

  assert.deepEqual(stale, [
    "packages/react: no such package",
    "packages/gone-plugin: no such package",
    "shared/dom-utils: no such shared dir",
    "shared/gone-env: no such shared dir",
    "packages/core/src/a.ts: no read of console.log",
    "packages/browser-plugin/src/log.ts: no read of console",
  ]);
});

test("fixture: an isomorphic package whose code the census does not read is unread", () => {
  const { unread } = census(
    [
      ...pkg("core", "a.ts", ""),
      ...pkg("docs-only", "README.md", ""),
      ...pkg("browser-plugin", "README.md", ""),
      ...pkg("react", "A.tsx", ""),
    ],
    POLICY,
  );

  assert.deepEqual(unread, ["packages/docs-only"]);
});
