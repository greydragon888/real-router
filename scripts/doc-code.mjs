// doc-code.mjs — type-checks the TypeScript fences of Markdown pages against
// the packages' `src` (#2706). `scripts/check-doc-code.mjs` runs it over the
// READMEs; the wiki's checker imports it from the monorepo.
//
// A page is read the way its reader reads it:
//
//   - One TypeScript program per PAGE, holding what the page imports. In one
//     program over every page, a package's internal augmentation of a core
//     type — one its published `.d.ts` does not carry — reaches the pages of
//     every other package.
//   - Every fence is a module, written in one framework: the one its imports
//     name, else the one its first line names in a comment (`// Angular`),
//     else its page's (an adapter's page), else the one its heading names
//     first, else React. Another framework's module — an import of it, an
//     adapter's export — resolves nothing for it.
//   - A name a fence uses without declaring it is looked up the way a reader
//     looks it up: an import in a fence above, an export of the page's own
//     package, an import in a fence below, a declaration in another fence, an
//     export of core or of another package, the fence's framework, the
//     reader's values (`READER_VALUES`). What remains is the reader's own,
//     typed `any` — unless it is shaped like library API (`use…`, `create…`,
//     `inject…`, `…Plugin`, `…Factory`): a renamed export must not pass for
//     the reader's own. A name the page imports or declares beats a DOM global
//     of that name, and so does a placeholder (`name`, `status`, …).
//   - A module the repository cannot resolve — the reader's own file, a
//     library the repository does not install — exports, as `any`, what the
//     page imports from it. An `@real-router/*` specifier that no package
//     exports stays an error.
//   - A fence that opens with an object literal, or that holds sibling JSX
//     elements, is read as the module it stands for (`readExcerpt`).
//
// A fence that is still not a program — two alternatives in one fence, a
// handler body with a top-level `return`, a list of signatures, an excerpt
// that does not parse — carries a marker on the line above it:
//
//   <!-- doc-code: skip — two alternatives in one fence -->
//
// The reason is required, and a marker on a fence that compiles is a finding,
// so a marker cannot outlive its reason.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/** Adapter packages: their pages are written in that framework. */
const ADAPTERS = ["react", "preact", "solid", "vue", "svelte", "angular"];
/** The modules a framework exports names from. */
const FW_LIBS = {
  react: ["react", "react-dom/client", "react-dom/server"],
  preact: ["preact", "preact/hooks"],
  solid: ["solid-js", "solid-js/web", "solid-js/store"],
  vue: ["vue"],
  svelte: ["svelte", "svelte/store", "svelte/reactivity"],
  angular: ["@angular/core"],
};
/** The framework an import specifier names. */
const FRAMEWORK_OF = [
  /^@real-router\/(react|preact|solid|vue|svelte|angular)(?:\/|$)/,
  /^(react)(?:-dom)?(?:\/|$)/,
  /^(preact)(?:\/|$)/,
  /^(solid)-js(?:\/|$)/,
  /^(vue)(?:\/|$)/,
  /^(svelte)(?:\/|$)/,
  /^@(angular)\//,
];
/** The frameworks a heading names, as it spells them. */
const FRAMEWORK_IN_HEADING = /\b(react|preact|solid|vue|svelte|angular)\b/i;
/** A non-React JSX fence names its runtime with a pragma on its first line. */
const PRAGMA = { preact: "preact", solid: "solid-js", vue: "vue" };
/** Diagnostics that say "this fence is not one program". */
const NOT_A_PROGRAM = new Set([1108, 2300, 2323, 2391, 2393, 2451, 2484, 2693]);
/** A name used and declared nowhere, in every wording TypeScript has for it. */
const UNDECLARED = new Set([2304, 2552, 2580, 2582, 2591, 2592, 2593, 18004]);
const UNDECLARED_NAME = /(?:Cannot find name|shorthand property) '([^']+)'/;
/** An implicit `any` that a callback handed to the reader's `any` reports. */
const IMPLICIT_ANY = new Set([7006, 7019, 7031]);
/** Placeholders a page writes that `lib.dom` declares as globals (`name` is `void` there). */
const DOM_PLACEHOLDERS = new Set([
  "name",
  "status",
  "origin",
  "length",
  "event",
  "parent",
  "top",
  "self",
  "closed",
]);
/** A name of this shape is library API: undeclared, it is a finding, not the reader's value. */
const LIBRARY_SHAPED = /^(?:use|create|inject)[A-Z]|(?:Plugin|Factory)$/;
/** A whole-line HTML comment addressed to this check. */
const DIRECTIVE = /^\s*(?:>\s*)?<!--\s*doc-code\b/;
const MARKER = /^<!--\s*doc-code:\s*skip\b\s*(?:[—–:-]\s*)?(.*?)\s*-->$/;
const HOW_TO_MARK =
  "if it is not meant to, mark it: `<!-- doc-code: skip — <reason> -->` on the line above the fence";

/**
 * The reader's own values, typed: what a fence uses when its page declares,
 * imports and exports no such name. `router` is the reader's router, holding
 * whatever dependencies the fence reads. Any other such name is `any`.
 */
export const READER_VALUES = {
  router: `declare let router: import("@real-router/core").Router<any>;`,
  routes: `declare let routes: import("@real-router/core").Route<any>[];`,
  state: `declare let state: import("@real-router/core").State;`,
  url: "declare let url: string;",
  params: "declare let params: Record<string, string>;",
  createAppRouter: `declare function createAppRouter(...args: any[]): import("@real-router/core").Router<any>;`,
};
/** What the reader's environment adds to the globals: a bundler's `import.meta`. */
export const READER_GLOBALS = `
interface Window { __SSR_STATE__: any }
interface ImportMeta { [key: string]: any }
`;

/**
 * @typedef {object} Diagnostic
 * @property {number} line     the line in the page
 * @property {number} code     the TypeScript code, or 0 for this check's own
 * @property {string} message
 *
 * @typedef {object} Block
 * @property {number} line     the fence's first code line, or a stray directive's line
 * @property {"clean" | "finding" | "skipped"} status
 * @property {string} [source] the fence's text, as the page holds it
 * @property {string} [reason] the marker's reason
 * @property {Diagnostic[]} diagnostics
 *
 * @typedef {object} PageResult
 * @property {string} rel      the page, relative to the root, or its file name
 * @property {Block[]} blocks
 */

const unquote = (line) => line.replace(/^\s*>\s?/, "");

/**
 * The TypeScript fences of a page, each with the marker above it and the
 * heading it sits under, and the directives that mark no TypeScript fence. A
 * `>` opens a blockquote only on the line that opens the fence: inside an
 * ordinary fence it is code (a wrapped generic's `>()`, a JSX `>`).
 */
export function fencesOf(text) {
  const lines = text.split("\n");
  const fences = [];
  const directives = new Map(); // line → consumed
  let heading = "";
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!cur) {
      if (DIRECTIVE.test(raw)) directives.set(i + 1, false);
      const title = /^#{1,6}\s+(.*)$/.exec(raw);
      if (title) heading = title[1];
      const quoted = /^\s*>/.test(raw);
      const open = /^\s*```(\w+)(?:[ \t].*)?$/.exec(
        quoted ? unquote(raw) : raw,
      );
      if (!open) continue;
      let above = i - 1;
      while (above >= 0 && unquote(lines[above]).trim() === "") above--;
      const marker =
        above >= 0 ? MARKER.exec(unquote(lines[above]).trim()) : null;
      cur = {
        lang: open[1].toLowerCase(),
        line: i + 2,
        quoted,
        body: [],
        marker: marker ? { line: above + 1, reason: marker[1] } : null,
      };
      continue;
    }
    const line = cur.quoted ? unquote(raw) : raw;
    if (/^\s*```\s*$/.test(line)) {
      if (["ts", "tsx", "typescript"].includes(cur.lang)) {
        if (cur.marker) directives.set(cur.marker.line, true);
        fences.push({
          lang: cur.lang,
          line: cur.line,
          marker: cur.marker,
          heading,
          text: `${cur.body.join("\n")}\n`,
        });
      }
      cur = null;
      continue;
    }
    cur.body.push(line);
  }
  const stray = [...directives]
    .filter(([, consumed]) => !consumed)
    .map(([line]) => line);
  return { fences, stray };
}

/**
 * Two shapes a page shows that are not modules, and that every reader reads
 * one way. A fence that opens with an object literal opens with a value — a
 * route definition when the object names itself, so it is checked as part of
 * a `Route` — and a fence of sibling JSX elements after its imports is
 * markup. Each is rewritten into the module it stands for, on the same lines;
 * anything else is `null`.
 */
function readExcerpt(ts, text, parses) {
  const lines = text.split("\n");
  const first = lines.findIndex(
    (l) => l.trim() !== "" && !l.trim().startsWith("//"),
  );
  if (first >= 0 && lines[first].trimStart().startsWith("{")) {
    const at = lines[first].indexOf("{");
    const wrap = (type) =>
      `${[
        ...lines.slice(0, first),
        `${lines[first].slice(0, at)}export const __excerpt${type} = ${lines[first].slice(at)}`,
        ...lines.slice(first + 1),
      ].join("\n")};\n`;
    for (const [kind, ext] of [
      [ts.ScriptKind.TS, ".ts"],
      [ts.ScriptKind.TSX, ".tsx"],
    ]) {
      const value = wrap("");
      if (!parses(value, kind)) continue;
      const sf = ts.createSourceFile(
        "x",
        value,
        ts.ScriptTarget.Latest,
        true,
        kind,
      );
      const init = sf.statements.find(ts.isVariableStatement)?.declarationList
        .declarations[0].initializer;
      const isRoute =
        init !== undefined &&
        ts.isObjectLiteralExpression(init) &&
        init.properties.some((p) => p.name?.getText(sf) === "name");
      const route = `: Partial<import("@real-router/core").Route<any>>`;
      return { text: isRoute ? wrap(route) : value, ext };
    }
  }
  const jsx = lines.findIndex((l) => l.trimStart().startsWith("<"));
  if (jsx >= 0) {
    const last = lines.findLastIndex((l) => l.trim() !== "");
    const markup = lines
      .map((l, i) => (i === jsx ? `<>${l}` : i === last ? `${l}</>` : l))
      .join("\n");
    if (parses(markup, ts.ScriptKind.TSX)) return { text: markup, ext: ".tsx" };
  }
  return null;
}

/** Each `@real-router/*` entry, mapped to its `src` file. */
function specMapOf(root) {
  const map = new Map();
  const dir = path.join(root, "packages");
  if (!existsSync(dir)) return map;
  for (const d of readdirSync(dir).sort()) {
    const manifest = path.join(dir, d, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    for (const [sub, entry] of Object.entries(pkg.exports ?? {})) {
      const src =
        entry && typeof entry === "object"
          ? entry["@real-router/internal-source"]
          : undefined;
      if (typeof src === "string") {
        map.set(
          pkg.name + (sub === "." ? "" : sub.slice(1)),
          path.join(dir, d, src),
        );
      }
    }
  }
  return map;
}

/**
 * The package a page documents: `packages/<pkg>/README.md`, a page named after
 * a package directory, or `<Adapter>-<Topic>.md`.
 */
function packageOf(root, file) {
  const rel = path.relative(root, file);
  const readme = /^packages\/([^/]+)\/README\.md$/.exec(rel)?.[1];
  if (readme) return readme;
  const name = path.basename(file, ".md");
  const adapter = /^(React|Preact|Solid|Vue|Svelte|Angular)-/
    .exec(name)?.[1]
    ?.toLowerCase();
  if (adapter) return adapter;
  return existsSync(path.join(root, "packages", name, "package.json"))
    ? name
    : null;
}

/** The framework a fence's imports name, or `null`. */
function frameworkOfFence(text) {
  for (const [, spec] of text.matchAll(
    /^\s*import\s(?:[^;]*?\sfrom\s)?\s*["']([^"']+)["']/gm,
  )) {
    const framework = frameworkOfSpec(spec);
    if (framework) return framework;
  }
  return null;
}

/** The framework an import specifier names, or `null`. */
function frameworkOfSpec(spec) {
  for (const pattern of FRAMEWORK_OF) {
    const match = pattern.exec(spec);
    if (match) return match[1];
  }
  return null;
}

/** The first framework a heading names, or `null`: "React / Preact / Solid" is React. */
const frameworkOfHeading = (heading) =>
  FRAMEWORK_IN_HEADING.exec(heading)?.[1].toLowerCase() ?? null;

/** The framework a fence's first line, a `// Angular` comment, names, or `null`. */
const frameworkOfComment = (text) =>
  frameworkOfHeading(/^\s*\/\/(.*)/.exec(text)?.[1] ?? "");

/**
 * What every page of one run shares: the compiler options, the resolution of
 * `@real-router/*` to `src`, the files parsed once, and the export index.
 */
function createEnvironment({ root, ts, readerValues, readerGlobals }) {
  const specMap = specMapOf(root);
  const adapterDirs = ADAPTERS.map((a) =>
    path.join(root, "packages", a),
  ).filter((d) => existsSync(d));
  const options = {
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    customConditions: ["@real-router/internal-source"],
    moduleDetection: ts.ModuleDetectionKind.Force,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
    allowImportingTsExtensions: true,
  };
  const parseErrorOf = (name, text, kind) =>
    ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, kind)
      .parseDiagnostics[0];
  const realHost = ts.createCompilerHost(options);
  const parsed = new Map(); // real files, parsed once for every program

  /** A module of the reader's: what the page imports from it, typed `any`. */
  function readerModule(virtual, spec) {
    const file = path.join(
      root,
      "packages",
      "__doc__",
      "readers",
      `${spec.replace(/[^A-Za-z0-9]+/g, "_")}.d.ts`,
    );
    if (!virtual.has(file)) {
      const names = new Set();
      const namespaces = new Set();
      const sources = [...virtual]
        .filter(([f]) => /\.tsx?$/.test(f) && !f.endsWith(".d.ts"))
        .map(([f, text]) =>
          ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true),
        );
      for (const sf of sources) {
        for (const st of sf.statements) {
          if (!ts.isImportDeclaration(st) || st.moduleSpecifier.text !== spec)
            continue;
          const bindings = st.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const el of bindings.elements)
              names.add((el.propertyName ?? el.name).text);
          }
          if (bindings && ts.isNamespaceImport(bindings))
            namespaces.add(bindings.name.text);
        }
      }
      // a namespace's members, read in any fence: a fence that leaves the
      // namespace undeclared is handed the import of the fence that declares it
      for (const sf of namespaces.size > 0 ? sources : []) {
        (function visit(n) {
          if (
            ts.isPropertyAccessExpression(n) &&
            ts.isIdentifier(n.expression) &&
            namespaces.has(n.expression.text)
          ) {
            names.add(n.name.text);
          }
          if (
            ts.isQualifiedName(n) &&
            ts.isIdentifier(n.left) &&
            namespaces.has(n.left.text)
          ) {
            names.add(n.right.text);
          }
          ts.forEachChild(n, visit);
        })(sf);
      }
      const exports = [...names]
        .filter((n) => n !== "default")
        .map((n) => `export declare const ${n}: any;\nexport type ${n} = any;`);
      virtual.set(
        file,
        `declare const _default: any;\nexport default _default;\n${exports.join("\n")}\n`,
      );
    }
    return {
      resolvedModule: {
        resolvedFileName: file,
        extension: ".d.ts",
        isExternalLibraryImport: false,
      },
    };
  }

  function makeHost(virtual, isBlock) {
    const dirs = new Set();
    for (const v of virtual.keys()) {
      for (
        let d = path.dirname(v);
        d.startsWith(root) && !dirs.has(d);
        d = path.dirname(d)
      ) {
        dirs.add(d);
      }
    }
    const host = {
      ...realHost,
      fileExists: (f) => virtual.has(f) || realHost.fileExists(f),
      directoryExists: (d) => dirs.has(d) || realHost.directoryExists(d),
      readFile: (f) => virtual.get(f) ?? realHost.readFile(f),
      getSourceFile(f, lang) {
        if (virtual.has(f))
          return ts.createSourceFile(f, virtual.get(f), lang, true);
        const key = `${f}|${typeof lang === "object" ? lang.languageVersion : lang}`;
        if (!parsed.has(key)) parsed.set(key, realHost.getSourceFile(f, lang));
        return parsed.get(key);
      },
      writeFile: () => {
        throw new Error("doc-code writes nothing");
      },
      resolveModuleNameLiterals(literals, containingFile, redirected, opts) {
        return literals.map((lit) => {
          const spec = lit.text;
          const target = specMap.get(spec);
          if (target) {
            return {
              resolvedModule: {
                resolvedFileName: target,
                extension: path.extname(target),
                isExternalLibraryImport: false,
              },
            };
          }
          const found = ts.resolveModuleName(
            spec,
            containingFile,
            opts,
            host,
            undefined,
            redirected,
          );
          if (found.resolvedModule || spec.startsWith("@real-router/"))
            return found;
          if (!spec.startsWith(".")) {
            // a framework or a library the page uses while its package does not depend on it
            for (const dir of adapterDirs) {
              const other = ts.resolveModuleName(
                spec,
                path.join(dir, "__doc__", "x.ts"),
                opts,
                host,
                undefined,
                redirected,
              );
              if (other.resolvedModule) return other;
            }
          }
          return isBlock(containingFile) ? readerModule(virtual, spec) : found;
        });
      },
    };
    return host;
  }

  // The export index: every entry and every framework, in one program, built
  // on the first name a page leaves undeclared.
  const fwStub = (fw, spec) =>
    path.join(
      root,
      "packages",
      "__doc__",
      "frameworks",
      fw,
      `${spec.replace(/[^A-Za-z0-9]+/g, "_")}.ts`,
    );
  let index;
  const indexOf = () => {
    if (!index) {
      const virtual = new Map();
      for (const [fw, specs] of Object.entries(FW_LIBS)) {
        for (const spec of specs) {
          virtual.set(
            fwStub(fw, spec),
            `import * as __fw from ${JSON.stringify(spec)};\nexport { __fw };\n`,
          );
        }
      }
      const program = ts.createProgram(
        [...new Set(specMap.values()), ...virtual.keys()],
        options,
        makeHost(virtual, () => false),
      );
      index = { program, checker: program.getTypeChecker(), cache: new Map() };
    }
    return index;
  };
  /** name → whether it is a type only */
  const exportsOfSymbol = (checker, sym) => {
    const names = new Map();
    if (sym) {
      for (const e of checker.getExportsOfModule(sym)) {
        const target =
          e.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(e) : e;
        names.set(e.name, (target.flags & ts.SymbolFlags.Value) === 0);
      }
    }
    return names;
  };
  const entryExports = (spec) => {
    const { program, checker, cache } = indexOf();
    if (!cache.has(spec)) {
      const sf = program.getSourceFile(specMap.get(spec));
      cache.set(
        spec,
        exportsOfSymbol(checker, sf && checker.getSymbolAtLocation(sf)),
      );
    }
    return cache.get(spec);
  };
  const fwExports = (fw, spec) => {
    const { program, checker, cache } = indexOf();
    const key = `${fw}:${spec}`;
    if (!cache.has(key)) {
      const imp = program
        .getSourceFile(fwStub(fw, spec))
        ?.statements.find(ts.isImportDeclaration);
      cache.set(
        key,
        exportsOfSymbol(
          checker,
          imp && checker.getSymbolAtLocation(imp.moduleSpecifier),
        ),
      );
    }
    return cache.get(key);
  };

  return {
    ts,
    root,
    options,
    specMap,
    values: { ...READER_VALUES, ...readerValues },
    globals: READER_GLOBALS + readerGlobals,
    parseErrorOf,
    makeHost,
    entryExports,
    fwExports,
  };
}

/** One page, in a program of its own. */
function checkPage(env, file) {
  const { ts, root, options, specMap, values, parseErrorOf } = env;
  const rel = file.startsWith(root + path.sep)
    ? path.relative(root, file)
    : path.basename(file);
  const pkg = packageOf(root, file);
  const pageFramework = ADAPTERS.includes(pkg) ? pkg : null;
  const hostDir = [
    pkg && path.join(root, "packages", pkg),
    path.join(root, "packages", "react"),
    root,
  ].find((d) => d && existsSync(d));
  const dir = path.join(hostDir, "__doc__", rel.replace(/[^A-Za-z0-9]+/g, "_"));
  const ownPkg =
    pkg && specMap.has(`@real-router/${pkg}`) ? `@real-router/${pkg}` : null;
  const { fences, stray } = fencesOf(readFileSync(file, "utf8"));

  // ── the fences, each a module in one framework
  const virtual = new Map();
  const blocks = [];
  for (const f of fences) {
    // `{/* Your app */}` stands for the reader's content: a child, not an empty slot
    let body = f.text.replace(/\{\s*\/\*[^\n]*?\*\/\s*\}/g, "{null as any}");
    // an adapter's page compares itself with React under headings that name it
    const framework =
      frameworkOfFence(body) ??
      frameworkOfComment(body) ??
      pageFramework ??
      frameworkOfHeading(f.heading) ??
      "react";
    const base = path.join(dir, `L${f.line}`);
    let ext = f.lang === "tsx" ? ".tsx" : ".ts";
    const kindOf = (e) => (e === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    let parseError = parseErrorOf(base + ext, body, kindOf(ext));
    // a ```typescript fence that holds JSX is checked as .tsx
    if (
      parseError &&
      ext === ".ts" &&
      !parseErrorOf(`${base}.tsx`, body, ts.ScriptKind.TSX)
    ) {
      ext = ".tsx";
      parseError = undefined;
    }
    const excerpt = parseError
      ? readExcerpt(ts, body, (t, kind) => !parseErrorOf(base + ext, t, kind))
      : null;
    if (excerpt) {
      ({ text: body, ext } = excerpt);
      parseError = undefined;
    }
    const head = PRAGMA[framework]
      ? `/** @jsxImportSource ${PRAGMA[framework]} */ `
      : "";
    const block = {
      line: f.line,
      marker: f.marker,
      source: f.text,
      framework,
      file: base + ext,
      text: head + body,
      parseError,
      appended: new Set(),
      exported: new Set(),
    };
    blocks.push(block);
    if (!parseError) virtual.set(block.file, block.text);
  }
  const readerFile = path.join(dir, "reader.d.ts");
  virtual.set(readerFile, env.globals);
  const checked = blocks.filter((b) => !b.parseError);
  const byFile = new Map(checked.map((b) => [b.file, b]));

  // ── what the page imports, by fence, and what it declares
  const imports = new Map(); // name → [{ spec, line, imported | ns | def, typeOnly }]
  const decls = new Map(); // name → [{ b, mutable }]
  for (const b of checked) {
    const sf = ts.createSourceFile(
      b.file,
      b.text,
      ts.ScriptTarget.Latest,
      true,
    );
    for (const st of sf.statements) {
      if (
        ts.isImportDeclaration(st) &&
        st.importClause &&
        !st.moduleSpecifier.text.startsWith(".")
      ) {
        const spec = st.moduleSpecifier.text;
        const typeOnly = st.importClause.isTypeOnly;
        const put = (n, v) =>
          (imports.get(n) ?? imports.set(n, []).get(n)).push({
            spec,
            line: b.line,
            ...v,
          });
        const bindings = st.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            put(el.name.text, {
              imported: (el.propertyName ?? el.name).text,
              typeOnly: typeOnly || el.isTypeOnly,
            });
          }
        }
        if (bindings && ts.isNamespaceImport(bindings))
          put(bindings.name.text, { ns: true, typeOnly });
        if (st.importClause.name)
          put(st.importClause.name.text, { def: true, typeOnly });
      }
      const exported =
        ts.canHaveModifiers(st) &&
        (ts.getModifiers(st) ?? []).some(
          (m) => m.kind === ts.SyntaxKind.ExportKeyword,
        );
      const add = (n, mutable) => {
        (decls.get(n) ?? decls.set(n, []).get(n)).push({ b, mutable });
        if (exported) b.exported.add(n);
      };
      if (ts.isVariableStatement(st)) {
        const mutable = (st.declarationList.flags & ts.NodeFlags.Const) === 0;
        for (const d of st.declarationList.declarations)
          if (ts.isIdentifier(d.name)) add(d.name.text, mutable);
      } else if (
        (ts.isFunctionDeclaration(st) ||
          ts.isClassDeclaration(st) ||
          ts.isInterfaceDeclaration(st) ||
          ts.isTypeAliasDeclaration(st) ||
          ts.isEnumDeclaration(st)) &&
        st.name
      ) {
        add(st.name.text, false);
      }
    }
  }

  const append = (b, line) =>
    virtual.set(b.file, `${virtual.get(b.file)}${line} // [doc-code]\n`);
  const importOf = (spec, name, typeOnly) =>
    `import ${typeOnly ? "type " : ""}{ ${name} } from ${JSON.stringify(spec)};`;
  const asImport = (name, i) => {
    const type = i.typeOnly ? "type " : "";
    if (i.ns)
      return `import ${type}* as ${name} from ${JSON.stringify(i.spec)};`;
    if (i.def) return `import ${type}${name} from ${JSON.stringify(i.spec)};`;
    const binding = i.imported === name ? name : `${i.imported} as ${name}`;
    return `import ${type}{ ${binding} } from ${JSON.stringify(i.spec)};`;
  };
  const libraryShaped = new Map(); // fence → names

  /** The line that declares, in fence `b`, a name it uses and does not declare. */
  function resolve(b, name) {
    // an import of another framework's module is that framework's name
    const all = (imports.get(name) ?? []).filter((i) =>
      [null, b.framework].includes(frameworkOfSpec(i.spec)),
    );
    const above = all
      .filter((i) => i.line < b.line)
      .sort((x, y) => y.line - x.line)[0];
    if (above) return asImport(name, above);
    if (ownPkg && env.entryExports(ownPkg).has(name))
      return importOf(ownPkg, name, env.entryExports(ownPkg).get(name));
    const below = all
      .filter((i) => i.line > b.line)
      .sort((x, y) => x.line - y.line)[0];
    if (below) return asImport(name, below);
    const decl = (decls.get(name) ?? []).filter((x) => x.b !== b);
    if (decl.length > 0) {
      const src =
        decl
          .filter((x) => x.b.line < b.line)
          .sort((x, y) => y.b.line - x.b.line)[0] ??
        decl.toSorted((x, y) => x.b.line - y.b.line)[0];
      if (!src.b.exported.has(name)) {
        src.b.exported.add(name);
        append(src.b, `export { ${name} };`);
      }
      const from = JSON.stringify(
        `./${path.basename(src.b.file).replace(/\.tsx?$/, "")}`,
      );
      // a `let` another fence assigns: a binding of this fence, of that type
      return src.mutable
        ? `declare let ${name}: typeof import(${from}).${name};`
        : `import { ${name} } from ${from};`;
    }
    const entries = [
      "@real-router/core",
      "@real-router/core/api",
      "@real-router/core/utils",
      `@real-router/${b.framework}`,
    ];
    for (const spec of new Set([...entries, ...specMap.keys()])) {
      // another framework's adapter exports nothing to this fence
      if (![null, b.framework].includes(frameworkOfSpec(spec))) continue;
      if (specMap.has(spec) && env.entryExports(spec).has(name))
        return importOf(spec, name, env.entryExports(spec).get(name));
    }
    for (const spec of FW_LIBS[b.framework]) {
      if (env.fwExports(b.framework, spec).has(name))
        return importOf(spec, name, env.fwExports(b.framework, spec).get(name));
    }
    if (Object.hasOwn(values, name)) return values[name];
    if (LIBRARY_SHAPED.test(name))
      (libraryShaped.get(b) ?? libraryShaped.set(b, new Set()).get(b)).add(
        name,
      );
    return `declare let ${name}: any; type ${name} = any;`;
  }

  /** A DOM global a fence reads where its page means something else. */
  const isNameOf = (n) =>
    (ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) ||
    (ts.isPropertyAssignment(n.parent) && n.parent.name === n) ||
    (ts.isQualifiedName(n.parent) && n.parent.right === n) ||
    ts.isJsxAttribute(n.parent);
  const isTag = (n) =>
    (ts.isJsxOpeningElement(n.parent) ||
      ts.isJsxSelfClosingElement(n.parent) ||
      ts.isJsxClosingElement(n.parent)) &&
    n.parent.tagName === n;
  function shadowedGlobal(b, n, checker) {
    if (!ts.isIdentifier(n) || b.appended.has(n.text) || isNameOf(n))
      return null;
    const decl = checker.getSymbolAtLocation(n)?.declarations?.[0];
    if (!decl || !/lib\.dom\.d\.ts$/.test(decl.getSourceFile().fileName))
      return null;
    const name = n.text;
    if (imports.has(name) || (decls.get(name) ?? []).some((x) => x.b !== b))
      return resolve(b, name);
    if (DOM_PLACEHOLDERS.has(name) || isTag(n))
      return `declare let ${name}: any;`;
    return null;
  }

  // ── the program, grown until every name a fence leaves undeclared is declared
  const host = env.makeHost(virtual, (f) => byFile.has(f));
  let program;
  let diags = [];
  for (let pass = 0; pass < 8; pass++) {
    program = ts.createProgram(
      [...byFile.keys(), readerFile],
      options,
      host,
      program,
    );
    diags = checked.flatMap((b) => [
      ...program.getSemanticDiagnostics(program.getSourceFile(b.file)),
    ]);
    let changed = false;
    for (const d of diags) {
      if (!UNDECLARED.has(d.code)) continue;
      const b = byFile.get(d.file.fileName);
      const name = UNDECLARED_NAME.exec(
        ts.flattenDiagnosticMessageText(d.messageText, " "),
      )?.[1];
      if (!name || b.appended.has(name)) continue;
      b.appended.add(name);
      append(b, resolve(b, name));
      changed = true;
    }
    const checker = program.getTypeChecker();
    for (const b of checked) {
      (function visit(n) {
        const line = shadowedGlobal(b, n, checker);
        if (line) {
          b.appended.add(n.text);
          append(b, line);
          changed = true;
        }
        ts.forEachChild(n, visit);
      })(program.getSourceFile(b.file));
    }
    if (!changed) break;
  }

  // ── what the reader's `any` reports says nothing about the page
  const checker = program.getTypeChecker();
  const isAny = (t) => (t.flags & ts.TypeFlags.Any) !== 0;
  const nodeAt = (sf, pos) => {
    let found;
    (function visit(n) {
      if (pos >= n.getStart(sf) && pos < n.getEnd()) {
        found = n;
        ts.forEachChild(n, visit);
      }
    })(sf);
    return found;
  };
  const saysNothing = (d) => {
    // a comparison of a class's private fields: `src` types them, the
    // published `.d.ts` erases them to `#private`, so no consumer sees it
    if (
      /The types of '#\w/.test(
        ts.flattenDiagnosticMessageText(d.messageText, " "),
      )
    )
      return true;
    // type arguments on a call of the reader's `any`
    if (d.code === 2347) {
      const call = ts.findAncestor(
        nodeAt(d.file, d.start),
        (n) => ts.isCallExpression(n) || ts.isNewExpression(n),
      );
      return (
        call !== undefined && isAny(checker.getTypeAtLocation(call.expression))
      );
    }
    // an implicit-any parameter of a callback handed to the reader's `any`
    if (!IMPLICIT_ANY.has(d.code)) return false;
    let n = nodeAt(d.file, d.start);
    while (n && !ts.isArrowFunction(n) && !ts.isFunctionExpression(n))
      n = n.parent;
    for (let p = n?.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) || ts.isNewExpression(p))
        return isAny(checker.getTypeAtLocation(p.expression));
      if (ts.isJsxAttribute(p)) {
        const el = ts.findAncestor(p, ts.isJsxOpeningLikeElement);
        return el ? isAny(checker.getTypeAtLocation(el.tagName)) : false;
      }
      if (ts.isBlock(p) || ts.isSourceFile(p)) return false;
    }
    return false;
  };

  // ── the verdicts
  const result = [];
  for (const line of stray) {
    result.push({
      line,
      status: "finding",
      diagnostics: [
        {
          line,
          code: 0,
          message:
            "a doc-code directive that marks no TypeScript fence — the marker is `<!-- doc-code: skip — <reason> -->`, on the line above a ts, tsx or typescript fence",
        },
      ],
    });
  }
  for (const b of blocks) {
    const own = [];
    let fragment = false;
    if (b.parseError) {
      const at = b.parseError.file.getLineAndCharacterOfPosition(
        b.parseError.start,
      ).line;
      own.push({
        line: b.line + at,
        code: b.parseError.code,
        message: `${ts.flattenDiagnosticMessageText(b.parseError.messageText, " ")} — the fence does not parse; ${HOW_TO_MARK}`,
      });
      fragment = true;
    } else {
      for (const d of diags) {
        if (
          d.file.fileName !== b.file ||
          UNDECLARED.has(d.code) ||
          saysNothing(d)
        )
          continue;
        own.push({
          line:
            b.line + d.file.getLineAndCharacterOfPosition(d.start ?? 0).line,
          code: d.code,
          message: ts.flattenDiagnosticMessageText(d.messageText, " "),
        });
      }
      for (const name of libraryShaped.get(b) ?? []) {
        own.push({
          line: b.line,
          code: 0,
          message: `\`${name}\` is shaped like library API, but no package and no framework exports it — import it from where it lives, or rename it if it is the reader's own`,
        });
      }
      const sf = ts.createSourceFile(
        b.file,
        b.text,
        ts.ScriptTarget.Latest,
        true,
      );
      fragment =
        own.some((d) => NOT_A_PROGRAM.has(d.code)) ||
        sf.statements.some(ts.isLabeledStatement);
    }
    const verdict = { line: b.line, source: b.source };
    if (b.marker) {
      const problem = !b.marker.reason
        ? "the doc-code marker names no reason: `<!-- doc-code: skip — <why this fence is not a program> -->`"
        : own.length === 0 && !fragment
          ? "the fence below compiles: drop its doc-code marker"
          : null;
      result.push(
        problem
          ? {
              ...verdict,
              status: "finding",
              diagnostics: [{ line: b.marker.line, code: 0, message: problem }],
            }
          : {
              ...verdict,
              status: "skipped",
              reason: b.marker.reason,
              diagnostics: [],
            },
      );
      continue;
    }
    if (fragment && !b.parseError) {
      if (own.length === 0)
        own.push({
          line: b.line,
          code: 0,
          message: "an excerpt, not a program",
        });
      own.push({
        line: b.line,
        code: 0,
        message: `the fence is not one program; ${HOW_TO_MARK}`,
      });
    }
    result.push({
      ...verdict,
      status: own.length > 0 ? "finding" : "clean",
      diagnostics: own,
    });
  }
  return { rel, blocks: result.sort((x, y) => x.line - y.line) };
}

/**
 * @param {object} options
 * @param {string} options.root          the monorepo
 * @param {string[]} options.files       the pages, absolute
 * @param {Record<string, string>} [options.readerValues] more of the reader's values, by name
 * @param {string} [options.readerGlobals] more of what the reader's environment declares
 * @param {any} [options.ts]             the TypeScript module
 * @returns {{ pages: PageResult[] }}
 */
export function checkDocCode({
  root,
  files,
  readerValues = {},
  readerGlobals = "",
  ts = require("typescript"),
}) {
  const env = createEnvironment({ root, ts, readerValues, readerGlobals });
  return { pages: files.map((file) => checkPage(env, file)) };
}
