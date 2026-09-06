// Family census for ForwardToCallback·params — the DENOMINATOR, from the
// git-tracked list (never a filesystem walk: `shared/` has no `src/` and Node's
// glob does not follow the symlinks). Counts, per file:
//   • references to the type `ForwardToCallback`
//   • invocation sites of the callback: `(this.#deps.getDependency, params)`
//   • call sites of the namespace primitive `.forwardState(` / `ctx.forwardState`
//     / `port.resolveForward(` — every way the bag reaches the callback
//   • `forwardFnMap` reads (who else could invoke a stored callback)
// Positive control: the two invocation sites in `#resolveDynamicForward` MUST
// be found, or the scanner is broken.
//
// Run (from W):
//   node benchmarks/audit-probes/membrane-globality-2026-09-05/forward-to-callback/enumerate-family.mjs <tracked-list.txt>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const listPath = process.argv[2];

if (!listPath) {
  throw new Error("pass the git ls-files output as argv[2]");
}

const root = process.cwd();
const files = readFileSync(listPath, "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.endsWith(".ts") && !line.endsWith(".d.ts"));

const PATTERNS = {
  typeRef: /\bForwardToCallback\b/g,
  invoke: /\(this\.#deps\.getDependency,\s*params\)/g,
  nsForwardState: /\.forwardState(?:<[^>]*>)?\(/g,
  ctxForwardState: /ctx\.forwardState(?:<[^>]*>)?\(/g,
  portResolveForward: /\.resolveForward\(/g,
  forwardFnMapRead: /forwardFnMap\[/g,
};

const totals = Object.fromEntries(Object.keys(PATTERNS).map((k) => [k, 0]));
const perFile = [];

for (const rel of files) {
  const text = readFileSync(resolve(root, rel), "utf8");
  const row = { file: rel };
  let any = false;

  for (const [name, re] of Object.entries(PATTERNS)) {
    const n = (text.match(re) ?? []).length;

    if (n > 0) {
      row[name] = n;
      totals[name] += n;
      any = true;
    }
  }

  if (any) {
    perFile.push(row);
  }
}

const control = perFile.find(
  (row) =>
    row.file.endsWith("RoutesNamespace/RoutesNamespace.ts") && row.invoke === 2,
);

console.log(
  JSON.stringify(
    {
      filesScanned: files.length,
      totals,
      perFile,
      control_invokeSitesInResolveDynamicForward: control ? 2 : "MISSING",
    },
    null,
    2,
  ),
);
