/**
 * Process-per-file benchmark runner (RFC §9.2).
 *
 * Each `*.bench.ts` file pins ONE matcher form (router options). Running them
 * in separate processes keeps their V8 inline caches isolated: a megamorphic
 * call-site in one form cannot deoptimize another and skew the WALL-CLOCK
 * numbers. This runner is LOCAL-ONLY dev: `pnpm -F @real-router/core bench`.
 *
 * CI does NOT use it. CodSpeed must inject V8 flags into the bench process and
 * can't carry them across spawn hops, so CI wraps the single-process
 * `codspeed.ts` entry directly — safe there because `simulation` runs JIT-off
 * (`--no-opt --predictable`), so inline-cache shape can't perturb the
 * deterministic instruction counts. See `codspeed.ts` + `codspeed.yml`.
 *
 * Each child is launched as
 * `node --conditions=@real-router/internal-source --import tsx <file>`, so
 * `@real-router/*` workspace imports resolve to `src/` (live source, no prior
 * build) — mirroring how `tsc` resolves via `customConditions` (see CLAUDE.md)
 * — and tsx transpiles the TypeScript on the fly.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const NODE_ARGS = [
  "--conditions=@real-router/internal-source",
  "--import",
  "tsx",
];

function main(): void {
  const directory = __dirname;
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".bench.ts"))
    .toSorted((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error(`No *.bench.ts files found in ${directory}`);
    process.exitCode = 1;

    return;
  }

  const failed: string[] = [];

  for (const file of files) {
    console.log(`\n=== ${file} ===`);

    const result = spawnSync(
      process.execPath,
      [...NODE_ARGS, path.join(directory, file)],
      { stdio: "inherit" },
    );

    if (result.error !== undefined || result.status !== 0) {
      const reason = result.error?.message ?? `exit ${String(result.status)}`;

      failed.push(file);
      console.error(`FAILED ${file}: ${reason}`);
    }
  }

  if (failed.length > 0) {
    console.error(
      `\n${String(failed.length)} bench file(s) failed: ${failed.join(", ")}`,
    );
    process.exitCode = 1;

    return;
  }

  console.log(`\nAll ${String(files.length)} bench file(s) completed.`);
}

main();
