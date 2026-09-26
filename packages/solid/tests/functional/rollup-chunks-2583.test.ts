// @vitest-environment node
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { rollup } from "rollup";
import { loadConfigFile } from "rollup/loadConfigFile";
import * as ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

import type { InputOption, MergedRollupOptions, OutputOptions } from "rollup";

/**
 * What `rollup.config.mjs` publishes, read from the builds themselves (#2583).
 *
 * A consumer resolves `.` and `./ssr` through one export condition and loads
 * each target with every chunk it imports. A module that set holds twice runs
 * twice: two copies of `context.ts` are two `createContext` calls, and a hook
 * from `/ssr` then reads a context the main entry's `RouterProvider` never
 * provides. Nothing in `src` shows it — the unit tests resolve both entries to
 * one module graph.
 *
 * The configs are loaded the way `rollup -c` loads them and generated in
 * memory, so `dist`, which may be stale when `test` runs, is never read. The
 * declaration bundles are left out: their input is `tsc` output under `dist`.
 * Inputs resolve against the package; babel resolves its presets from the
 * cwd, which turbo sets to the package.
 */

const PACKAGE_ROOT = path.resolve(__dirname, "../..");
const ROLLUP_CONFIG = path.join(PACKAGE_ROOT, "rollup.config.mjs");
const CONTEXT_MODULE = path.join("src", "context.ts");

/** Resolves to `src` inside the monorepo only — no build emits it. */
const MONOREPO_CONDITION = "@real-router/internal-source";

/** Conditions that name no runtime file. */
const NOT_RUNTIME = new Set([MONOREPO_CONDITION, "types"]);

/** The format each runtime condition's target is built in. */
const FORMAT_OF: Record<string, string> = {
  solid: "es",
  import: "es",
  require: "cjs",
};

const FORMAT_ALIASES: Record<string, string> = {
  esm: "es",
  module: "es",
  commonjs: "cjs",
};

const manifest = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
) as { exports: Record<string, Record<string, unknown>> };

interface Chunk {
  /** Package-relative: `dist/esm/index.mjs`. */
  file: string;
  format: string;
  isEntry: boolean;
  /** The module an entry chunk stands for, package-relative. */
  facade: string | undefined;
  /** Module ids, package-relative; rollup resolves the `dom-utils` symlink to its target. */
  modules: string[];
  /** Package-relative files this chunk imports, dynamic imports included. */
  imports: string[];
  code: string;
}

interface Target {
  subpath: string;
  condition: string;
  /** Package-relative. */
  file: string;
}

/** Package-relative and normalised: `./dist/esm/`, `dist/esm` and an absolute path read the same. */
const fromPackage = (...segments: string[]): string =>
  path.relative(PACKAGE_ROOT, path.resolve(PACKAGE_ROOT, ...segments));

const byName = (left: string, right: string): number =>
  left.localeCompare(right);

/** `input` resolved against the package, in the shape it was written — rollup reads the shape. */
function resolveInput(input: InputOption | undefined): InputOption {
  if (typeof input === "string") {
    return path.resolve(PACKAGE_ROOT, input);
  }

  if (Array.isArray(input)) {
    return input.map((file) => path.resolve(PACKAGE_ROOT, file));
  }

  return Object.fromEntries(
    Object.entries(input ?? {}).map(([name, file]) => [
      name,
      path.resolve(PACKAGE_ROOT, file),
    ]),
  );
}

function inputFiles(input: InputOption | undefined): string[] {
  const resolved = resolveInput(input);

  return typeof resolved === "string" || Array.isArray(resolved)
    ? [resolved].flat()
    : Object.values(resolved);
}

function outputDirectory(output: OutputOptions): string {
  return output.dir ?? path.dirname(output.file ?? "");
}

async function generate(builds: MergedRollupOptions[]): Promise<Chunk[]> {
  const chunks: Chunk[] = [];

  for (const build of builds) {
    const bundle = await rollup({
      ...build,
      input: resolveInput(build.input),
      onLog: () => {},
    });

    try {
      for (const output of build.output) {
        const directory = outputDirectory(output);
        const format = output.format ?? "es";
        const { output: emitted } = await bundle.generate(output);

        for (const item of emitted) {
          if (item.type === "chunk") {
            chunks.push({
              file: fromPackage(directory, item.fileName),
              format: FORMAT_ALIASES[format] ?? format,
              isEntry: item.isEntry,
              facade:
                item.facadeModuleId === null
                  ? undefined
                  : fromPackage(item.facadeModuleId),
              modules: Object.keys(item.modules).map((id) => fromPackage(id)),
              imports: [...item.imports, ...item.dynamicImports].map((file) =>
                fromPackage(directory, file),
              ),
              code: item.code,
            });
          }
        }
      }
    } finally {
      await bundle.close();
    }
  }

  return chunks;
}

/** A condition's value as the files it resolves to — a nested object's keys are conditions too. */
function leaves(value: unknown): string[] {
  if (typeof value === "string") {
    return [fromPackage(value)];
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .filter(([condition]) => !NOT_RUNTIME.has(condition))
      .flatMap(([, nested]) => leaves(nested));
  }

  return [];
}

function runtimeTargets(): Target[] {
  return Object.entries(manifest.exports).flatMap(([subpath, conditions]) =>
    Object.entries(conditions)
      .filter(([condition]) => !NOT_RUNTIME.has(condition))
      .flatMap(([condition, value]) =>
        leaves(value).map((file) => ({ subpath, condition, file })),
      ),
  );
}

/** The chunks a consumer loads for these files: the files and everything they import. */
function loaded(chunks: Chunk[], files: string[]): Chunk[] {
  const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk]));
  const seen = new Set<string>();
  const queue = [...files];

  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (!seen.has(file)) {
      seen.add(file);
      queue.push(...(byFile.get(file)?.imports ?? []));
    }
  }

  return chunks.filter((chunk) => seen.has(chunk.file));
}

/** Every module the chunks hold more than once. */
function duplicated(chunks: Chunk[]): string[] {
  const seen = new Map<string, number>();

  for (const module of chunks.flatMap((chunk) => chunk.modules)) {
    seen.set(module, (seen.get(module) ?? 0) + 1);
  }

  return [...seen]
    .filter(([, count]) => count > 1)
    .map(([module]) => module)
    .toSorted(byName);
}

function jsxNodes(code: string): number {
  const source = ts.createSourceFile(
    "chunk.jsx",
    code,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JSX,
  );
  let count = 0;

  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxElement(node) ||
      ts.isJsxSelfClosingElement(node) ||
      ts.isJsxFragment(node)
    ) {
      count++;
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return count;
}

describe("rollup.config.mjs publishes one module graph (#2583)", () => {
  let builds: MergedRollupOptions[];
  let chunks: Chunk[];
  let targets: Target[];
  let conditions: string[];

  const filesOf = (condition: string): string[] =>
    targets
      .filter((target) => target.condition === condition)
      .map((target) => target.file);

  const perCondition = <T>(
    value: (condition: string) => T,
  ): Record<string, T> =>
    Object.fromEntries(
      conditions.map((condition) => [condition, value(condition)]),
    );

  beforeAll(async () => {
    const { options } = await loadConfigFile(ROLLUP_CONFIG, {});

    builds = options.filter((build) =>
      inputFiles(build.input).every(
        (file) => !fromPackage(file).startsWith(`dist${path.sep}`),
      ),
    );
    chunks = await generate(builds);
    targets = runtimeTargets();
    conditions = [...new Set(targets.map((target) => target.condition))];
  }, 60_000);

  describe("a consumer loads every module once", () => {
    it("every runtime condition is one this file knows how to check", () => {
      expect(conditions.toSorted(byName)).toStrictEqual(
        Object.keys(FORMAT_OF).toSorted(byName),
      );
    });

    it("both subpaths through one condition load no module twice", () => {
      expect(
        perCondition((condition) =>
          duplicated(loaded(chunks, filesOf(condition))),
        ),
      ).toStrictEqual(perCondition(() => []));
    });

    it("CONTROL — what each condition loads carries the router contexts", () => {
      // The census above follows imports from the targets; if it lost the
      // shared chunk, it would find no duplicates because it found nothing.
      expect(
        perCondition((condition) =>
          loaded(chunks, filesOf(condition)).some((chunk) =>
            chunk.modules.includes(CONTEXT_MODULE),
          ),
        ),
      ).toStrictEqual(perCondition(() => true));
    });

    it("CONTROL — building each entry on its own copies the contexts into both", async () => {
      // The layout #643 introduced: one build per entry. The census must see
      // what it produces, or its silence above proves nothing.
      const shared = builds.find((build) => inputFiles(build.input).length > 1);

      expect(shared).toBeDefined();

      const perEntry = await generate(
        Object.entries(
          resolveInput(shared?.input) as Record<string, string>,
        ).map(([name, file]) => ({
          ...shared!,
          input: { [name]: file },
          output: shared!.output.slice(0, 1),
        })),
      );
      const entries = perEntry
        .filter((chunk) => chunk.isEntry)
        .map((chunk) => chunk.file);

      expect(entries.length).toBeGreaterThan(1);
      expect(duplicated(loaded(perEntry, entries))).toContain(CONTEXT_MODULE);
    }, 60_000);

    it("no two builds write the same file", () => {
      const files = chunks.map((chunk) => chunk.file);

      expect(files.length).toBeGreaterThan(0);
      expect(
        files.filter((file, index) => files.indexOf(file) !== index),
      ).toStrictEqual([]);
    });

    it("every module rollup bundles is this package's own source", () => {
      // Everything else stays external (#2300). `src/dom-utils` is a symlink,
      // and rollup names its modules after the target.
      const ownRoots = [
        path.join("src") + path.sep,
        fromPackage(realpathSync(path.join(PACKAGE_ROOT, "src", "dom-utils"))) +
          path.sep,
      ];
      const modules = [...new Set(chunks.flatMap((chunk) => chunk.modules))];

      expect(modules).toContain(CONTEXT_MODULE);
      expect(modules.some((module) => module.startsWith(ownRoots[1]))).toBe(
        true,
      );
      // `\0`-prefixed ids are rollup's own virtual modules — bundled
      // babel helpers, for one — and belong to the bundle.
      expect(
        modules.filter(
          (module) =>
            !module.startsWith("\0") &&
            ownRoots.every((root) => !module.startsWith(root)),
        ),
      ).toStrictEqual([]);
    });
  });

  describe("`exports` names what the builds emit", () => {
    it("every runtime target is an emitted entry, and every entry is a target", () => {
      const entries = chunks
        .filter((chunk) => chunk.isEntry)
        .map((chunk) => chunk.file);

      expect(targets.length).toBeGreaterThan(0);
      expect([...new Set(entries)].toSorted(byName)).toStrictEqual(
        [...new Set(targets.map((target) => target.file))].toSorted(byName),
      );
    });

    it("each target is its own subpath's entry, built in its condition's format", () => {
      const key = (target: Target): string =>
        `${target.subpath} ${target.condition}`;
      const chunkOf = (file: string): Chunk | undefined =>
        chunks.find((chunk) => chunk.file === file);
      const sourceOf = (subpath: string): string =>
        fromPackage(String(manifest.exports[subpath][MONOREPO_CONDITION]));

      expect(
        Object.fromEntries(
          targets.map((target) => [
            key(target),
            {
              facade: chunkOf(target.file)?.facade,
              format: chunkOf(target.file)?.format,
            },
          ]),
        ),
      ).toStrictEqual(
        Object.fromEntries(
          targets.map((target) => [
            key(target),
            {
              facade: sourceOf(target.subpath),
              format: FORMAT_OF[target.condition],
            },
          ]),
        ),
      );
    });

    it("every chunk a target loads carries the target's file extension", () => {
      // `package.json` says `"type": "commonjs"`: an ES chunk named `.js`
      // beside an `.mjs` entry is read by Node as CommonJS.
      expect(
        Object.fromEntries(
          targets.map((target) => [
            target.file,
            [
              ...new Set(
                loaded(chunks, [target.file]).map((chunk) =>
                  path.extname(chunk.file),
                ),
              ),
            ],
          ]),
        ),
      ).toStrictEqual(
        Object.fromEntries(
          targets.map((target) => [target.file, [path.extname(target.file)]]),
        ),
      );
    });

    it("each subpath resolves `solid` before any other runtime condition, behind the monorepo's", () => {
      // A bundler takes the first key its conditions match. `import`,
      // `browser` or `node` ahead of `solid` would hand vite-plugin-solid the
      // compiled DOM output again; `solid` ahead of the monorepo's condition
      // would send the monorepo's own vite-plugin-solid builds (adapter-bench)
      // to `dist`.
      const subpaths = Object.entries(manifest.exports);

      expect(subpaths.length).toBeGreaterThan(0);
      expect(
        Object.fromEntries(
          subpaths.map(([subpath, conditionsOf]) => {
            const keys = Object.keys(conditionsOf);

            return [
              subpath,
              {
                first: keys[0],
                firstRuntime: keys.find((key) => !NOT_RUNTIME.has(key)),
              },
            ];
          }),
        ),
      ).toStrictEqual(
        Object.fromEntries(
          subpaths.map(([subpath]) => [
            subpath,
            { first: MONOREPO_CONDITION, firstRuntime: "solid" },
          ]),
        ),
      );
    });

    it("the `solid` targets are source: what they load holds JSX, and what the others load holds none", () => {
      expect(
        perCondition((condition) =>
          loaded(chunks, filesOf(condition)).some(
            (chunk) => jsxNodes(chunk.code) > 0,
          ),
        ),
      ).toStrictEqual(perCondition((condition) => condition === "solid"));
    });
  });
});
