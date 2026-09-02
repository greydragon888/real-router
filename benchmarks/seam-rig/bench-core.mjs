// One arm, one process, median of N rounds. Prints JSON for `drive.mjs`.
//
//   node bench-core.mjs <bundle.mjs> <arm> [rounds]
import { pathToFileURL } from "node:url";
import path from "node:path";

const [, , BUNDLE, ARM, ROUNDS] = process.argv;
// Resolved against cwd so a relative `out/…` works from the shell as well as
// the absolute path `drive.mjs` passes.
const SPEC = pathToFileURL(path.resolve(BUNDLE)).href;
const { createRouter } = await import(SPEC);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const router = createRouter([
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
  { name: "u", path: "/u/:id?tab" },
  { name: "d", path: "/d?page", defaultSearch: { page: "1" } },
  { name: "p", path: "/p", children: [{ name: "c", path: "/c" }] },
]);
await router.start("/");

let i = 0;
const ARMS = {
  // The render-path doors — `<Link>` calls buildPath, adapters call isActiveRoute.
  "buildPath-static": { k: 20000, step: () => router.buildPath("a") },
  "buildPath-params": { k: 20000, step: () => router.buildPath("u", { id: "7" }) },
  "buildPath-default": { k: 20000, step: () => router.buildPath("d") },
  "isActiveRoute-exact": { k: 20000, step: () => router.isActiveRoute("home") },
  "isActiveRoute-parent": { k: 20000, step: () => router.isActiveRoute("p") },
  // The commit door, for the other side of any seam trade.
  navigate: { k: 4000, step: () => void router.navigate(i++ % 2 ? "a" : "home") },
};

const { k, step } = ARMS[ARM] ?? (() => { throw new Error(`unknown arm ${ARM}`); })();

for (let w = 0; w < 5; w++) for (let j = 0; j < k; j++) step();

const times = [];
for (let r = 0; r < Number(ROUNDS ?? 13); r++) {
  const t0 = process.hrtime.bigint();
  for (let j = 0; j < k; j++) step();
  times.push(Number(process.hrtime.bigint() - t0) / k);
}
console.log(JSON.stringify({ median: median(times) }));
