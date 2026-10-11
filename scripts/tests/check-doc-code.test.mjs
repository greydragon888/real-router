// Mutation guard for the README code gate (#2706).
//
// Every reading rule of `doc-code.mjs` gets a page whose verdict flips if the
// rule goes inert — beside a control whose verdict must not. A rule that
// resolves a name is held by a page where the resolved type, not `any`,
// decides the verdict, so a rule that fell through to the reader's `any`
// fails here rather than passing quietly.
//
// `scripts/scripts-tests.mjs` runs it in pre-push and Repo Lints.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkDocCode, fencesOf } from "../doc-code.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(ROOT, "scripts", "check-doc-code.mjs");
// Under os.tmpdir(), never the checkout (#2563).
const FIXTURE = mkdtempSync(join(tmpdir(), "doc-code-fixture-"));

after(() => rmSync(FIXTURE, { recursive: true, force: true }));

const ts = (code) => `\`\`\`ts\n${code}\n\`\`\`\n`;
const tsx = (code) => `\`\`\`tsx\n${code}\n\`\`\`\n`;
const MARK = "<!-- doc-code: skip — a reason -->\n";

/**
 * page → [its text, the verdict of each fence and directive, in page order].
 * A page's name decides its package, as a README's directory does: `core.md`
 * documents core, `React-*.md` the React adapter, anything else no package.
 */
const PAGES = {
  // a type error is a finding, and a correct fence is clean
  "typed.md": [
    ts(`import { createRouter } from "@real-router/core";\ncreateRouter(42);`),
    ["finding"],
  ],
  "typed-control.md": [
    ts(
      `import { createRouter } from "@real-router/core";\ncreateRouter([{ name: "home", path: "/" }]);`,
    ),
    ["clean"],
  ],

  // a fence that does not parse, or is not one program, needs a marker
  "unparsed.md": [ts("const = ;"), ["finding"]],
  "unparsed-marked.md": [MARK + ts("const = ;"), ["skipped"]],
  "fragment.md": [ts("const a = 1;\nconst a = 2;"), ["finding"]],
  "fragment-marked.md": [MARK + ts("const a = 1;\nconst a = 2;"), ["skipped"]],
  "labeled.md": [ts("onEnter: () => {}"), ["finding"]],

  // a marker cannot outlive its reason, cannot lack one, and cannot stray
  "stale-marker.md": [MARK + ts("const a = 1;"), ["finding"]],
  "no-reason.md": [
    `<!-- doc-code: skip -->\n${ts("const a = 1;\nconst a = 2;")}`,
    ["finding"],
  ],
  "stray-bash.md": [`${MARK}\`\`\`bash\nnpm install\n\`\`\`\n`, ["finding"]],
  "stray-prose.md": [`Some prose.\n\n${MARK}\nMore prose.\n`, ["finding"]],

  // a name is looked up the way a reader looks it up
  "import-above.md": [
    ts(`import { getNavigator as nav } from "@real-router/core";`) +
      ts("nav(42);"),
    ["clean", "finding"],
  ],
  "import-below.md": [
    ts("nav(42);") +
      ts(`import { getNavigator as nav } from "@real-router/core";`),
    ["finding", "clean"],
  ],
  "page-declaration.md": [
    ts("const total = 42;") + ts("total.toUpperCase();"),
    ["clean", "finding"],
  ],
  "page-beats-reader.md": [
    ts("const router = 42;") + ts(`router.navigate("home");`),
    ["clean", "finding"],
  ],
  "core.md": [
    ts("const getNavigator = (x: number) => x;") + ts("getNavigator(42);"),
    ["clean", "finding"],
  ],
  "core-export.md": [ts("getNavigator(42);"), ["finding"]],
  "reader-router.md": [ts("router.navigate(42);"), ["finding"]],
  "reader-router-control.md": [ts(`router.navigate("home");`), ["clean"]],
  "library-shaped.md": [ts("useWidget();"), ["finding"]],
  "reader-value.md": [ts("loadWidget();"), ["clean"]],
  "dom-placeholder.md": [ts("console.log(name.toUpperCase());"), ["clean"]],
  "callback-to-any.md": [ts("loadWidget((x) => x.y);"), ["clean"]],
  "shorthand.md": [ts("export const config = { baseRouter };"), ["clean"]],
  "test-globals.md": [
    ts(`describe("x", () => {\n  it("y", () => {});\n});`),
    ["clean"],
  ],
  "React-framework.md": [ts("startTransition(42);"), ["finding"]],
  // logger-plugin depends on no framework: the import resolves through an adapter's
  "logger-plugin.md": [
    ts(
      `import { useState } from "react";\nconst [, setCount] = useState(0);\nsetCount("x");`,
    ),
    ["finding"],
  ],
  "Preact-markup.md": [
    tsx(
      `import { Link } from "@real-router/preact";\nexport const el = <Link routeName="home" />;`,
    ),
    ["clean"],
  ],
  // an adapter's page is written in its framework, imports or none: Solid
  // writes `class`, under a heading that names React too
  "Solid-attributes.md": [
    `### Same as React\n\n${tsx(`export const el = <div class="x" />;`)}`,
    ["clean"],
  ],
  // a page of no adapter: a fence's framework is the one its heading names,
  // in a word or in a package name
  "multi-framework.md": [
    `### Preact\n\n${tsx(`export const a = <div class="x" />;`)}\n### How @real-router/preact does it\n\n${tsx(`export const b = <div class="y" />;`)}\n### Plain\n\n${tsx(`export const c = <div className="z" />;`)}`,
    ["clean", "clean", "clean"],
  ],
  // a fence that opens by naming its framework is that framework's, whatever the heading
  "comment-framework.md": [
    `### Solid / Angular\n\n${ts("// Angular\nexport class Form {\n  constructor() {\n    injectRouteExit(async () => {});\n  }\n}")}`,
    ["clean"],
  ],
  // an import of another framework's module resolves nothing for a React fence
  "foreign-import.md": [
    tsx(
      `import { Link } from "@real-router/preact";\nexport const a = <Link routeName="home" />;`,
    ) + tsx(`export const b = <Link routeName="about" />;`),
    ["clean", "clean"],
  ],
  // nor does another adapter's export. The two controls hold what the cell
  // stands on: the React adapter does not export `RouterContext`, the Preact
  // one does.
  "adapter-scope.md": [
    tsx(
      "export const el = <RouterContext.Provider value={null}><div /></RouterContext.Provider>;",
    ),
    ["clean"],
  ],
  "adapter-scope-react.md": [
    tsx(`import { RouterContext } from "@real-router/react";`),
    ["finding"],
  ],
  "adapter-scope-preact.md": [
    tsx(
      `import { RouterContext } from "@real-router/preact";\nexport const el = <RouterContext.Provider value={null}><div /></RouterContext.Provider>;`,
    ),
    ["clean"],
  ],
  // a `let` another fence assigns, and a reader's value a fence assigns
  "let-across.md": [
    ts(
      `import { createRouter } from "@real-router/core";\nlet appRouter: ReturnType<typeof createRouter>;`,
    ) + ts("appRouter = createRouter([]);"),
    ["clean", "clean"],
  ],
  "reader-assign.md": [ts("selfEmitting = true;"), ["clean"]],
  // a name the page imports, and a JSX tag, beat the DOM global of that name
  "dom-shadowed.md": [
    ts(
      `import { screen } from "testing-of-the-reader";\nscreen.getByRole("x");`,
    ) + ts(`screen.getByRole("y");`),
    ["clean", "clean"],
  ],
  "React-dom-tag.md": [tsx("export const el = <Navigation />;"), ["clean"]],
  "import-meta.md": [
    ts("if (import.meta.hot) import.meta.hot.accept();"),
    ["clean"],
  ],
  "any-type-args.md": [ts("loadWidget<string>();"), ["clean"]],
  // `src` types `Router`'s private fields, which make it invariant in its
  // dependency map; the published `.d.ts` erases them, and a typed router
  // passes to the provider there
  "private-fields.md": [
    tsx(
      `import { createRouter } from "@real-router/core";\nimport { RouterProvider } from "@real-router/react";\nconst typed = createRouter<{ api: string }>([]);\nexport const el = <RouterProvider router={typed}><div /></RouterProvider>;`,
    ),
    ["clean"],
  ],

  // a module the repository cannot resolve is the reader's; `@real-router/*` is not
  "reader-module.md": [
    ts(`import { thing } from "./local-module";\nthing.anything();`),
    ["clean"],
  ],
  "reader-namespace.md": [
    ts(`import * as codec from "codec-of-the-reader";\ncodec.stringify({});`) +
      ts(`codec.parse("x");`),
    ["clean", "clean"],
  ],
  "strict-scope.md": [
    ts(`import { noSuchExport } from "@real-router/core";`) +
      ts(`import { anything } from "@real-router/no-such-package";`),
    ["finding", "finding"],
  ],

  // the shapes a page shows that are not modules
  "React-placeholder.md": [
    tsx(
      `import { RouterProvider } from "@real-router/react";\n<RouterProvider router={router}>{/* Your app */}</RouterProvider>;`,
    ),
    ["clean"],
  ],
  "React-markup.md": [
    tsx(
      `import { Link } from "@real-router/react";\n\n<Link routeName="home" />\n<Link routeName={42} />`,
    ),
    ["finding"],
  ],
  "React-markup-control.md": [
    tsx(
      `import { Link } from "@real-router/react";\n\n<Link routeName="home" />\n<Link routeName="about" />`,
    ),
    ["clean"],
  ],
  "route-excerpt.md": [
    ts(`// a route\n{ name: "home", path: 42 }`),
    ["finding"],
  ],
  "route-excerpt-control.md": [ts(`{ name: "home", path: "/" }`), ["clean"]],
  // an excerpt shows the options it is about: a route without its path
  "route-excerpt-partial.md": [
    ts(`{ name: "home", canActivate: () => () => true }`),
    ["clean"],
  ],
  // an object that does not name itself is a value, not a route: its `path` is its own
  "value-excerpt.md": [ts(`{ path: 42, arrayFormat: "brackets" }`), ["clean"]],
  // a signature written as an arrow: a type in a value's place
  "signature.md": [
    ts("const check = (toState: State) => boolean;"),
    ["finding"],
  ],
  "tsx-retry.md": [
    "```typescript\nconst el = <div className={42} />;\n```\n",
    ["finding"],
  ],

  // where a fence is, and what it holds
  "quoted.md": ["> ```ts\n> const a: string = 1;\n> ```\n", ["finding"]],
  "indented.md": [
    "1. Step\n\n   ```ts\n   const a: string = 1;\n   ```\n",
    ["finding"],
  ],
  "info-string.md": ["```ts title=x\nconst a: string = 1;\n```\n", ["finding"]],
  "wrapped-generic.md": [
    ts("const m = new Map<\n  string,\n  number\n>();"),
    ["clean"],
  ],
  "javascript.md": ["```js\nconst a: string = 1;\n```\n", []],

  // one program per page: a page's global does not reach another page
  "isolation-a.md": [
    ts(
      "declare global {\n  interface Window { onlyOnPageA: string }\n}\nexport {};",
    ),
    ["clean"],
  ],
  "isolation-b.md": [ts("window.onlyOnPageA.toUpperCase();"), ["finding"]],
};

for (const [name, [text]] of Object.entries(PAGES))
  writeFileSync(join(FIXTURE, name), text);

const { pages } = checkDocCode({
  root: ROOT,
  files: Object.keys(PAGES).map((name) => join(FIXTURE, name)),
});
const byName = new Map(pages.map((page) => [page.rel, page]));

for (const [name, [, expected]] of Object.entries(PAGES)) {
  test(`${name}: ${expected.join(", ") || "nothing to check"}`, () => {
    const page = byName.get(name);
    assert.deepEqual(
      page.blocks.map((block) => block.status),
      expected,
      JSON.stringify(page.blocks.map((block) => block.diagnostics)),
    );
  });
}

test("each finding names its page line", () => {
  writeFileSync(
    join(FIXTURE, "lines.md"),
    `# Title\n\nText.\n\n${ts("const a = 1;\nconst b: string = 2;")}`,
  );
  const [page] = checkDocCode({
    root: ROOT,
    files: [join(FIXTURE, "lines.md")],
  }).pages;
  assert.deepEqual(
    page.blocks[0].diagnostics.map((d) => [d.line, d.code]),
    [[7, 2322]],
  );
});

test("a fence that is not one program says how to mark it", () => {
  for (const name of ["fragment.md", "signature.md"]) {
    const messages = byName
      .get(name)
      .blocks[0].diagnostics.map((d) => d.message);
    assert.ok(
      messages.some((m) => m.includes("not one program")),
      `${name}: ${JSON.stringify(messages)}`,
    );
  }
});

test("a rewritten excerpt is checked, not set aside as unparsed", () => {
  // a parse error would carry a 1xxx code: these are type errors
  const codes = (name) =>
    byName.get(name).blocks.flatMap((b) => b.diagnostics.map((d) => d.code));
  assert.deepEqual(codes("route-excerpt.md"), [2322]);
  assert.deepEqual(codes("React-markup.md"), [2322]);
  assert.deepEqual(codes("tsx-retry.md"), [2322]);
});

test("fencesOf reads the marker above a fence and the directives that mark none", () => {
  const { fences, stray } = fencesOf(
    [
      "<!-- doc-code: skip — two alternatives -->",
      "",
      "```ts",
      "const a = 1;",
      "```",
      "<!-- doc-code: skip — above prose -->",
      "Prose.",
      "<!-- doc-code: skp — a typo -->",
      "```ts",
      "const b = 1;",
      "```",
    ].join("\n"),
  );
  assert.deepEqual(
    fences.map((f) => [f.line, f.marker]),
    [
      [4, { line: 1, reason: "two alternatives" }],
      [10, null],
    ],
  );
  assert.deepEqual(stray, [6, 8]);
});

const run = (...args) =>
  spawnSync(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: "utf8" });

test("the CLI exits 0 on a clean page and prints the count", () => {
  const result = run(join(FIXTURE, "typed-control.md"));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /^doc-code: 1 pages, 1 fences compile, 0 skipped by a marker, 0 with findings$/m,
  );
});

test("the CLI exits 1 on a finding and prints it as page:line", () => {
  const result = run(join(FIXTURE, "fragment.md"));
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /^fragment\.md:2 {2}TS2451 {2}Cannot redeclare/m);
});

test("the CLI exits 2 on a page that does not exist", () => {
  const result = run(join(FIXTURE, "missing.md"));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no such page/);
});
