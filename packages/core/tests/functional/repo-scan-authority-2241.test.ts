import { execFileSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every test that reads the repository BEYOND its own workspace is registered here
 * (#2241).
 *
 * The defect this answers is not that some scans are uncovered — it is that coverage
 * is REGISTERED BY HAND. Three repo-wide censuses were lifted into explicit hook steps
 * case by case as each was written, and every one added since inherited the hole
 * instead of the fix: `captured-intrinsics-authority-1971` sat RED on `master` from
 * #2236 until #2240 while the hook on the very commit that broke it printed
 * `@real-router/core:test: cache hit, replaying logs (no errors)`. A list that a
 * human has to remember to extend loses the next scan the same way, whatever the
 * list is written in.
 *
 * So this file derives the set instead of declaring it, and the table below is a
 * TRIPWIRE rather than an inventory: a new cross-workspace reader that nobody
 * registers reds the first assertion, and a registered file that stops reading
 * across workspaces reds the second.
 *
 * ⚠ **This closes the DISCOVERY half only.** Knowing which tests are repo-wide is
 * not the same as running them when a sibling changes; the scheduling half is what
 * #2241's options argue about. Without it a scan is still replayed from a stale
 * cache — it just cannot be replayed UNNOTICED any more.
 *
 * ## Why the predicate is an AST fold and not a grep
 *
 * Measured while writing this, on the real tree:
 *
 * - a census keyed on the name of the root constant missed **three of the eleven** —
 *   the files spell it `PACKAGES`, `PACKAGES_DIR`, `REPO`, `REPO_ROOT` and `CORE_SRC`,
 *   and nothing makes them agree;
 * - a census keyed on `"../../.."` returned **160 files**, nearly all of them ordinary
 *   relative imports.
 *
 * The fold answers the only question that matters — *which tree does this path name* —
 * and it is deliberately CONSERVATIVE: a path-shaped expression that will not fold is
 * reported, because "I could not tell" must not read as "it stays home".
 *
 * ⚑ Nine shapes were used to attack it, and each one that slipped through is a comment
 * in the code below: string concatenation instead of `path.resolve` (unnormalised, so
 * the value literally starts with the package path while pointing above it), a bare
 * `resolve` imported from `node:path`, `fileURLToPath(import.meta.url)`, a root built
 * inside a `describe` rather than at module scope, a `cwd` option, and a shell command
 * naming its tree after a space.
 *
 * ⚠ Known limits, stated rather than implied. A scanner exported from a package's
 * `src` and imported by a test is invisible here (no instance today); so is a path
 * assembled from values this fold cannot see AND rooted in a parameter, though the
 * constant that seeds such a walker is itself reported. `child_process` calls are
 * classified only by the tree-naming literals among their arguments — an unfoldable
 * COMMAND is not evidence of an escape the way an unfoldable PATH is.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/**
 * The registered cross-workspace readers, and why each one is one.
 *
 * ⚠ `covered` records how the scan reaches a runner that is NOT `turbo run test` —
 * `none` is the defect #2241 is open about, not an accident of this table.
 */
const REGISTRY: readonly { file: string; reads: string; covered: string }[] = [
  {
    file: "packages/core/tests/functional/captured-intrinsics-authority-1971.test.ts",
    reads: "every package's src, plus shared/",
    covered: "none",
  },
  {
    file: "packages/core/tests/functional/claim-census-authority-2092.test.ts",
    reads: "every package's src and docs, shared/, and the root Markdown",
    covered: "lint:claims — pre-commit and ci.yml",
  },
  {
    file: "packages/core/tests/functional/comment-historiography-authority.test.ts",
    reads: "every package's src and tests",
    covered: "none",
  },
  {
    file: "packages/core/tests/functional/computed-key-write-authority-1852.test.ts",
    reads: "every package's src",
    covered: "none",
  },
  {
    file: "packages/core/tests/functional/line-anchor-authority.test.ts",
    reads: "every tracked source and Markdown file in the repository",
    covered: "lint:anchors — pre-commit and ci.yml",
  },
  {
    file: "packages/core/tests/functional/prototype-term-authority-2197.test.ts",
    reads: "every package's src, plus shared/",
    covered: "lint:proto-terms — pre-commit and ci.yml",
  },
  {
    file: "packages/core/tests/functional/read-count-authority.test.ts",
    reads: "every package's src and shared/ (one describe of a mixed file)",
    covered: "none",
  },
  {
    file: "packages/core/tests/functional/seam-census-authority-2090.test.ts",
    reads: "every package's src and tests, plus benchmarks/",
    covered: "none",
  },
  {
    file: "packages/core/tests/functional/test-name-authority-2125.test.ts",
    reads: "every package's src and tests, plus shared/",
    covered: "none",
  },
  {
    file: "packages/react/tests/functional/dom-utils/target-predicate-authority-1834.test.ts",
    reads: "every package's src — from a test in @real-router/react, not core",
    covered: "none",
  },
  {
    file: "packages/validation-plugin/tests/functional/core-union-mirror-authority-2091.test.ts",
    reads: "packages/core/src — from a test in @real-router/validation-plugin",
    covered: "none",
  },
  {
    // ⚑ The ratchet is itself a repository-wide scan and therefore subject to its own
    // rule. It found this entry rather than being told about it: the first run failed
    // with exactly one unregistered file, its own path. A predicate that exempted
    // itself would be the only scan in the repository nothing watches.
    file: "packages/core/tests/functional/repo-scan-authority-2241.test.ts",
    reads:
      "every test and test helper in the repository, plus the hook and ci.yml",
    covered: "none",
  },
];

const FS_READERS = new Set([
  "globSync",
  "readdirSync",
  "readFileSync",
  "existsSync",
  "statSync",
  "lstatSync",
  "opendirSync",
  "realpathSync",
  "readlinkSync",
  "accessSync",
  "glob",
  "readdir",
  "readFile",
  "stat",
  "opendir",
]);

/**
 * ⚠ The boundary admits whitespace and quotes, not only `^` and `/`. A shell command
 * names its tree after a space (`grep -rl … packages/<name>/src`), and a boundary of
 * `(^|/)` reads that as workspace-local — measured, that was a missed mutation.
 */
const OTHER_TREES = /(^|[\s/'"`=])(packages|shared|benchmarks|examples)\//u;

const UNRESOLVED = Symbol("unresolved");

type Folded = string | typeof UNRESOLVED;

/**
 * ⚠ Named predicates rather than inline `/…/.test(…)`, and not for style:
 * `vitest/no-conditional-tests` reads a `.test(` call inside an `if` as the vitest
 * global `test()` in a conditional and reds the file — the same lesson
 * `canonical-brand-authority-1968` records.
 */
const isChildProcessModule = (specifier: string): boolean =>
  /^(node:)?child_process$/u.test(specifier);
const isFsModule = (specifier: string): boolean =>
  /^(node:)?fs(\/promises)?$/u.test(specifier);
const isSpawnerName = (name: string): boolean =>
  /^(exec|execFile|spawn)(Sync)?$/u.test(name);
const namesAnotherTree = (value: string): boolean => OTHER_TREES.test(value);

/** Local names bound to a `child_process` spawner in this file. */
function collectSpawners(node: ts.ImportDeclaration, into: Set<string>): void {
  if (!ts.isStringLiteral(node.moduleSpecifier)) {
    return;
  }
  if (!isChildProcessModule(node.moduleSpecifier.text)) {
    return;
  }

  const bindings = node.importClause?.namedBindings;

  if (!bindings || !ts.isNamedImports(bindings)) {
    return;
  }
  for (const element of bindings.elements) {
    const original = (element.propertyName ?? element.name).text;

    if (isSpawnerName(original)) {
      into.add(element.name.text);
    }
  }
}

/** Local names bound to an `fs` reader, and the namespaces `fs` was imported under. */
function collectFsReaders(
  node: ts.ImportDeclaration,
  readers: Set<string>,
  namespaces: Set<string>,
): void {
  if (!ts.isStringLiteral(node.moduleSpecifier)) {
    return;
  }
  if (!isFsModule(node.moduleSpecifier.text)) {
    return;
  }

  const bindings = node.importClause?.namedBindings;

  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      if (FS_READERS.has((element.propertyName ?? element.name).text)) {
        readers.add(element.name.text);
      }
    }
  }
  if (bindings && ts.isNamespaceImport(bindings)) {
    namespaces.add(bindings.name.text);
  }
  if (node.importClause?.name) {
    namespaces.add(node.importClause.name.text);
  }
}

function calleeNameOf(node: ts.CallExpression): string {
  const callee = node.expression;

  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }

  return "";
}

/**
 * The expression that decides which TREE a path expression names. `path.join(A, b)`
 * is decided by `A`; a template whose head is empty is decided by its first span.
 */
function rootOf(node: ts.Expression | undefined): ts.Expression | undefined {
  let current = node;

  while (current) {
    if (ts.isCallExpression(current)) {
      const name = calleeNameOf(current);

      if (name !== "resolve" && name !== "join") {
        return current;
      }

      current = current.arguments[0];
      continue;
    }
    if (
      ts.isTemplateExpression(current) &&
      current.templateSpans.length > 0 &&
      current.head.text === ""
    ) {
      current = current.templateSpans[0].expression;
      continue;
    }

    return current;
  }

  return undefined;
}

interface ReadContext {
  source: ts.SourceFile;
  fold: (node: ts.Expression | undefined) => Folded;
  foldPrefix: (node: ts.Expression | undefined) => Folded;
  moduleScope: Set<string>;
  insideRepo: (value: string) => boolean;
  insideWorkspace: (value: string) => boolean;
}

const relativeToRepo = (value: string): string =>
  path.relative(REPO_ROOT, path.normalize(value)) || ".";

/** Tree-naming literals among a spawned command's arguments. */
function spawnedTreeReasons(
  node: ts.CallExpression,
  name: string,
  source: ts.SourceFile,
): string[] {
  const literals: string[] = [];
  const gather = (argument: ts.Node | undefined): void => {
    if (!argument) {
      return;
    }
    if (
      ts.isStringLiteral(argument) ||
      ts.isNoSubstitutionTemplateLiteral(argument)
    ) {
      literals.push(argument.text);
    } else if (ts.isTemplateExpression(argument)) {
      literals.push(argument.getText(source));
    } else if (ts.isArrayLiteralExpression(argument)) {
      for (const element of argument.elements) {
        gather(element);
      }
    }
  };

  for (const argument of node.arguments) {
    gather(argument);
  }

  return literals
    .filter((literal) => namesAnotherTree(literal))
    .map((literal) => `${name}("${literal.slice(0, 60)}")`);
}

/** The fs reader this call names, if it names one. */
function readerOf(
  node: ts.CallExpression,
  readers: Set<string>,
  namespaces: Set<string>,
): string | undefined {
  if (ts.isIdentifier(node.expression) && readers.has(node.expression.text)) {
    return node.expression.text;
  }
  if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    namespaces.has(node.expression.expression.text) &&
    FS_READERS.has(node.expression.name.text)
  ) {
    return node.expression.name.text;
  }

  return undefined;
}

/** Why this call's PATH argument names another tree. */
function pathReasons(
  node: ts.CallExpression,
  reader: string,
  context: ReadContext,
): string[] {
  const first = node.arguments[0] as ts.Expression | undefined;
  const folded = context.foldPrefix(first);

  if (typeof folded === "string") {
    if (!path.isAbsolute(folded)) {
      return namesAnotherTree(folded) || folded.startsWith("../")
        ? [`${reader}("${folded}")`]
        : [];
    }

    return context.insideRepo(folded) && !context.insideWorkspace(folded)
      ? [`${reader}() → ${relativeToRepo(folded)}`]
      : [];
  }
  if (!first) {
    return [];
  }

  const root = rootOf(first) ?? first;
  const derived = ts.isIdentifier(root) && !context.moduleScope.has(root.text);

  return derived
    ? []
    : [`${reader}(unresolved: ${first.getText(context.source).slice(0, 60)})`];
}

/** Why this call's `cwd` option names another tree. */
function cwdReasons(
  node: ts.CallExpression,
  reader: string,
  context: ReadContext,
): string[] {
  const options = node.arguments[1];

  if (!options || !ts.isObjectLiteralExpression(options)) {
    return [];
  }

  const property = options.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) &&
      candidate.name.getText(context.source) === "cwd",
  );

  if (!property || !ts.isPropertyAssignment(property)) {
    return [];
  }

  const value = context.fold(property.initializer);

  if (value === UNRESOLVED) {
    return [`${reader}(cwd unresolved)`];
  }

  return path.isAbsolute(value) &&
    context.insideRepo(value) &&
    !context.insideWorkspace(value)
    ? [`${reader}(cwd → ${relativeToRepo(value)})`]
    : [];
}

/** Why this file reads outside its own workspace, or an empty list if it does not. */
function escapeReasons(relative: string): string[] {
  const absolute = path.join(REPO_ROOT, relative);
  const directory = path.dirname(absolute);
  // the workspace a file belongs to: the nearest ancestor holding a package.json
  let workspace = directory;

  while (
    workspace !== REPO_ROOT &&
    !existsSync(path.join(workspace, "package.json"))
  ) {
    workspace = path.dirname(workspace);
  }

  const source = ts.createSourceFile(
    absolute,
    readFileSync(absolute, "utf8"),
    ts.ScriptTarget.ESNext,
    true,
  );

  // ⚠ Declarations come from EVERY scope. `chain-walk-authority` builds its root inside
  // a `describe`, and a module-level-only collector reported three such files as
  // unresolvable — false positives, all of them workspace-local.
  const declarations = new Map<string, ts.Expression[]>();
  const collect = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const list = declarations.get(node.name.text) ?? [];

      list.push(node.initializer);
      declarations.set(node.name.text, list);
    }

    ts.forEachChild(node, collect);
  };

  collect(source);

  // Folding reads every scope; REPORTING an unfoldable identifier reads only this set.
  // A name bound inside a walker (`const full = path.join(dir, entry.name)`) cannot
  // fold — its tree was decided by whoever called the walker — and reporting it would
  // flag every recursive directory reader in the repository.
  const moduleScope = new Set<string>();

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        moduleScope.add(declaration.name.text);
      }
    }
  }

  const folding = new Set<string>();
  const cache = new Map<string, Folded>();
  const calleeName = (
    node: ts.CallExpression,
  ): { name: string; qualified: boolean } => {
    const callee = node.expression;

    if (ts.isPropertyAccessExpression(callee)) {
      const owner = callee.expression.getText(source);

      return {
        name: callee.name.text,
        qualified: owner === "path" || owner === "nodePath",
      };
    }

    return {
      name: ts.isIdentifier(callee) ? callee.text : "",
      qualified: true,
    };
  };

  /** `__dirname`, or a name bound anywhere in the file to something that folds. */
  const foldIdentifier = (node: ts.Identifier): Folded => {
    if (node.text === "__dirname") {
      return directory;
    }

    const cached = cache.get(node.text);

    if (cached !== undefined) {
      return cached;
    }
    if (!declarations.has(node.text) || folding.has(node.text)) {
      return UNRESOLVED;
    }

    folding.add(node.text);
    let value: Folded = UNRESOLVED;

    for (const initializer of declarations.get(node.text) ?? []) {
      const candidate = fold(initializer);

      if (candidate !== UNRESOLVED) {
        value = candidate;

        break;
      }
    }

    folding.delete(node.text);
    cache.set(node.text, value);

    return value;
  };

  const foldTemplate = (node: ts.TemplateExpression): Folded => {
    let out = node.head.text;

    for (const span of node.templateSpans) {
      const value = fold(span.expression);

      if (value === UNRESOLVED) {
        return UNRESOLVED;
      }

      out += value + span.literal.text;
    }

    return out;
  };

  /**
   * `path.resolve(…)` and a bare `resolve(…)` imported from node:path are the same
   * escape; so is `fileURLToPath(import.meta.url)`, which is how an ESM file names
   * itself where `__dirname` is absent. `undefined` means "not a path call".
   */
  const foldCall = (node: ts.CallExpression): Folded | undefined => {
    const { name, qualified } = calleeName(node);

    if (qualified && (name === "resolve" || name === "join")) {
      const parts = node.arguments.map((argument) => fold(argument));

      if (parts.includes(UNRESOLVED)) {
        return UNRESOLVED;
      }

      const strings = parts as string[];

      return name === "resolve"
        ? path.resolve(...strings)
        : path.join(...strings);
    }
    if (qualified && name === "dirname") {
      const value = fold(node.arguments[0]);

      return value === UNRESOLVED ? UNRESOLVED : path.dirname(value);
    }

    return name === "fileURLToPath" ? absolute : undefined;
  };

  const fold = (node: ts.Expression | undefined): Folded => {
    if (!node) {
      return UNRESOLVED;
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isIdentifier(node)) {
      return foldIdentifier(node);
    }
    if (ts.isTemplateExpression(node)) {
      return foldTemplate(node);
    }
    if (ts.isCallExpression(node)) {
      const folded = foldCall(node);

      if (folded !== undefined) {
        return folded;
      }
    }
    if (ts.isParenthesizedExpression(node)) {
      return fold(node.expression);
    }
    // `__dirname + "/../.."` is the same escape written with an operator, and a folder
    // that stops at `+` calls it unresolvable — that is, silently workspace-local.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = fold(node.left);
      const right = fold(node.right);

      return left === UNRESOLVED || right === UNRESOLVED
        ? UNRESOLVED
        : left + right;
    }

    return UNRESOLVED;
  };

  // The PREFIX decides the tree: `path.join(CORE_SRC, file)` never folds whole because
  // `file` is a loop variable, yet its first argument already names the tree.
  const foldPrefix = (node: ts.Expression | undefined): Folded => {
    const whole = fold(node);

    if (whole !== UNRESOLVED) {
      return whole;
    }

    const root = rootOf(node);

    return root && root !== node ? fold(root) : UNRESOLVED;
  };

  const readers = new Set<string>();
  const namespaces = new Set<string>();
  // A spawned command is classified ONLY by tree-naming literals among its arguments:
  // its first argument is a binary, not a path, so "cannot fold" is not evidence of an
  // escape. Measured — `spawnSync(process.execPath, …)` in a workspace-local benchmark
  // runner was this rule's only false positive.
  const spawners = new Set<string>();
  const visitImports = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      collectSpawners(node, spawners);
      collectFsReaders(node, readers, namespaces);
    }

    ts.forEachChild(node, visitImports);
  };

  visitImports(source);

  const reasons: string[] = [];
  // ⚠ NORMALISE before comparing. `path.resolve` folds `..` away and string concatenation
  // does not, so `__dirname + "/../../.."` yields a value that literally starts with the
  // workspace path while pointing three levels above it — a missed mutation until this.
  const insideWorkspace = (value: string): boolean =>
    path.normalize(value) === workspace ||
    path.normalize(value).startsWith(workspace + path.sep);
  const insideRepo = (value: string): boolean =>
    path.normalize(value) === REPO_ROOT ||
    path.normalize(value).startsWith(REPO_ROOT + path.sep);

  // signal 1 — a constant whose value names another tree
  for (const name of declarations.keys()) {
    const value = fold(ts.factory.createIdentifier(name));

    if (typeof value !== "string" || !path.isAbsolute(value)) {
      continue;
    }
    // An absolute value landing OUTSIDE the repository is not a repository path at all
    // — it is a route or a fixture string that merely starts with "/". Measured: two
    // such constants were this predicate's only false positives.
    if (!insideRepo(value) || insideWorkspace(value)) {
      continue;
    }

    reasons.push(
      `const ${name} → ${path.relative(REPO_ROOT, path.normalize(value)) || "."}`,
    );
  }

  // signals 2 and 3 — the reads themselves
  const context: ReadContext = {
    source,
    fold,
    foldPrefix,
    moduleScope,
    insideRepo,
    insideWorkspace,
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        spawners.has(node.expression.text)
      ) {
        reasons.push(...spawnedTreeReasons(node, node.expression.text, source));
      }

      const reader = readerOf(node, readers, namespaces);

      if (reader !== undefined) {
        reasons.push(
          ...pathReasons(node, reader, context),
          ...cwdReasons(node, reader, context),
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return [...new Set(reasons)];
}

/**
 * Every test file AND every helper beside one. ⚠ Not just `*.test.ts`: a scan moved
 * into a helper is invisible to a census keyed on the test suffix — measured, a
 * `tests/functional/helpers/scan.ts` globbing every package's `src` was classified as
 * absent before this glob covered it.
 */
function candidateFiles(): string[] {
  const skip = (file: string): boolean =>
    file.includes("node_modules") ||
    file.includes("/dist/") ||
    file.startsWith(".claude/");

  return [
    ...new Set([
      ...globSync("**/*.{test,properties,spec}.{ts,tsx}", {
        cwd: REPO_ROOT,
        exclude: skip,
      }),
      ...globSync("**/tests/**/*.{ts,tsx}", { cwd: REPO_ROOT, exclude: skip }),
    ]),
  ].toSorted((left, right) => left.localeCompare(right));
}

describe("every repository-wide scan is registered (#2241)", () => {
  const derived = new Map<string, string[]>();

  for (const file of candidateFiles()) {
    const reasons = escapeReasons(file);

    if (reasons.length > 0) {
      derived.set(file, reasons);
    }
  }

  it("the sweep reached the tree it claims to sweep", () => {
    // A predicate that silently scanned nothing would pass every assertion below.
    expect(candidateFiles().length).toBeGreaterThan(1000);
    expect(derived.size).toBeGreaterThan(0);
  });

  it("no unregistered test reads beyond its own workspace", () => {
    const registered = new Set(REGISTRY.map((entry) => entry.file));
    const unregistered = [...derived]
      .filter(([file]) => !registered.has(file))
      .map(([file, reasons]) => `${file} — ${reasons.join("; ")}`);

    expect(unregistered).toStrictEqual([]);
  });

  it("every registered test still reads beyond its own workspace", () => {
    const stale = REGISTRY.filter((entry) => !derived.has(entry.file)).map(
      (entry) => entry.file,
    );

    expect(stale).toStrictEqual([]);
  });

  it("every registered file exists", () => {
    const missing = REGISTRY.filter(
      (entry) => !existsSync(path.join(REPO_ROOT, entry.file)),
    );

    expect(missing.map((entry) => entry.file)).toStrictEqual([]);
  });

  it("the registry records where each scan is covered, including where it is not", () => {
    // `covered: "none"` is the open defect, and spelling it out is the point: a table
    // that only listed the covered ones would read as complete.
    const uncovered = REGISTRY.filter(
      (entry) => entry.covered === "none",
    ).length;

    expect(uncovered).toBeGreaterThan(0);
    expect(REGISTRY.every((entry) => entry.covered.length > 0)).toBe(true);
  });

  it("a scan named as covered by a root script is really named by that script", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const broken: string[] = [];

    for (const entry of REGISTRY) {
      const match = /^(lint:[\w-]+)/u.exec(entry.covered);

      if (!match) {
        continue;
      }

      const script = manifest.scripts[match[1]];

      if (script === undefined) {
        broken.push(`${entry.covered} — no such root script`);
        continue;
      }
      if (!script.includes(path.basename(entry.file))) {
        broken.push(`${match[1]} does not name ${path.basename(entry.file)}`);
      }
    }

    expect(broken).toStrictEqual([]);
  });

  it("a scan covered by a root script reaches BOTH schedulers, not one", () => {
    // ⚠ A hook is not a gate on this repository: infrastructure commits use
    // `--no-verify` routinely, and a hook-only scan therefore stands between a defect
    // and `master` only for whoever did not bypass it. `lint:anchors` was exactly that
    // — present in `.husky/pre-commit`, absent from `ci.yml` — while the repository's
    // own record shows a rotten anchor shipping in `c1020c885` on a replayed cache.
    // Both halves are required here so the one-sided shape cannot come back quietly.
    const hook = readFileSync(
      path.join(REPO_ROOT, ".husky/pre-commit"),
      "utf8",
    );
    const ci = readFileSync(
      path.join(REPO_ROOT, ".github/workflows/ci.yml"),
      "utf8",
    );
    const wiring = REGISTRY.flatMap((entry) => {
      const match = /^(lint:[\w-]+)/u.exec(entry.covered);

      if (!match) {
        return [];
      }

      return [
        {
          script: match[1],
          hook: hook.includes(match[1]),
          ci: ci.includes(match[1]),
        },
      ];
    });

    expect(wiring).not.toStrictEqual([]);
    expect(
      wiring.filter((row) => !row.hook).map((row) => row.script),
    ).toStrictEqual([]);
    expect(
      wiring.filter((row) => !row.ci).map((row) => row.script),
    ).toStrictEqual([]);
  });

  it("the repository is a git checkout, so the sweep is over tracked files", () => {
    // Positive control for the glob: git's own list and the sweep must overlap, else
    // the sweep is reading a tree nobody ships. A count alone cannot show that — an
    // `exclude` that dropped a whole package would still leave thousands of files.
    // `git` is the tool this repository is checked out with, the argument list is fixed
    // and carries no caller input, and asking git is the only way to learn what is TRACKED.
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- see the two lines above
    const tracked = execFileSync("git", ["ls-files", "*.test.ts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);

    expect(tracked.length).toBeGreaterThan(0);

    const swept = new Set(candidateFiles());

    expect(tracked.filter((file) => swept.has(file))).toHaveLength(
      tracked.length,
    );
  });
});
