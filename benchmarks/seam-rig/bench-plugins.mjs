// `router.buildPath` — the href door — with the REAL plugins installed.
//
//   node bench-plugins.mjs <bundle.mjs> <arm> [rounds]
//   arms: none | schema | persistent | both
//
// ⚑ This is the arm that decides a seam move, and a stand-in interceptor does
// NOT stand in for it: measured, a trivial pass-through cost +16 % where the
// real `searchSchemaPlugin` costs +68 %. The work a seam move puts on the render
// path is the PLUGIN's, so the plugin has to be the one running.
import { pathToFileURL } from "node:url";
import path from "node:path";

const [, , BUNDLE, ARM, ROUNDS] = process.argv;
// Resolved against cwd so a relative `out/…` works from the shell as well as
// the absolute path `drive.mjs` passes.
const SPEC = pathToFileURL(path.resolve(BUNDLE)).href;
const { createRouter, searchSchemaPlugin, persistentParamsPluginFactory } =
  await import(SPEC);

// zod is a `benchmarks` dependency; resolved by path because the bundles under
// out/ are standalone and carry no node_modules of their own.
const { z } = await import(
  new URL("../node_modules/zod/index.js", import.meta.url)
);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Three optional keys: small enough to be a floor, not a worst case. A bigger
// schema costs more, so re-measure against the app's own before quoting this.
const shape = z.object({
  q: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).max(999).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
});
const searchSchema = {
  "~standard": {
    version: 1,
    vendor: "perf-rig",
    validate: (value) => {
      const r = shape.safeParse(value);
      return r.success
        ? { value: r.data }
        : { issues: r.error.issues.map((x) => ({ message: x.message, path: x.path })) };
    },
  },
};

const router = createRouter([
  { name: "home", path: "/" },
  { name: "list", path: "/list?q&page&sort", searchSchema },
]);
if (ARM === "schema" || ARM === "both")
  router.usePlugin(searchSchemaPlugin({ mode: "production", strict: false }));
if (ARM === "persistent" || ARM === "both")
  router.usePlugin(persistentParamsPluginFactory({ sort: "asc" }));
await router.start("/");

const search = { q: "hello", page: "2" };
const k = ARM === "none" ? 20000 : 6000;
const step = () => router.buildPath("list", {}, search);

for (let w = 0; w < 5; w++) for (let j = 0; j < k; j++) step();

const times = [];
for (let r = 0; r < Number(ROUNDS ?? 13); r++) {
  const t0 = process.hrtime.bigint();
  for (let j = 0; j < k; j++) step();
  times.push(Number(process.hrtime.bigint() - t0) / k);
}
console.log(JSON.stringify({ median: median(times) }));
