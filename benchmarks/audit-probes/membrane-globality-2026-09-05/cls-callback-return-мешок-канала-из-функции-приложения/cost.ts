// COST of strategy (a) on the two hot doors of the family:
//   D1 Route.encodeParams·return — consumed by RoutesNamespace.buildPath, which
//      shared/dom-utils/link-utils.ts · buildHref calls on every <Link> render.
//   D2 Route.decodeParams·return — consumed by RoutesNamespace.matchPath.
//
// A/B: the SAME door, same route shape (one path slot + one declared query key —
// the real bag shape of this family, not the five-key form), arms interleaved,
// with an A/A floor arm. Core is not edited: the boundary copy is EMULATED
// inside the codec, which allocates exactly the one extra container level per
// channel that a boundary copy would.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-callback-return-.../cost.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { bench, do_not_optimize, run } from "mitata";

type Ch = { params: Record<string, unknown>; search: Record<string, unknown> };

// A realistic codec: it uppercases the path slot and passes the query through,
// building its own bags — the container a boundary copy would then re-copy.
const encodePlain = (ch: Ch): Ch => ({
  params: { id: String(ch.params.id).toUpperCase() },
  search: ch.search,
});
const encodeCopied = (ch: Ch): Ch => {
  const r = encodePlain(ch);

  // exactly what a one-shot boundary copy costs: one fresh container per channel
  return { params: { ...r.params }, search: { ...r.search } };
};
const decodePlain = (ch: Ch): Ch => ({
  params: { id: String(ch.params.id).toLowerCase() },
  search: ch.search,
});
const decodeCopied = (ch: Ch): Ch => {
  const r = decodePlain(ch);

  return { params: { ...r.params }, search: { ...r.search } };
};

const mk = (encode?: unknown, decode?: unknown): ReturnType<typeof createRouter> =>
  createRouter([
    {
      name: "u",
      path: "/u/:id?tab",
      ...(encode ? { encodeParams: encode } : {}),
      ...(decode ? { decodeParams: decode } : {}),
    },
  ] as never);

const rEncA = mk(encodePlain);
const rEncA2 = mk(encodePlain);
const rEncB = mk(encodeCopied);
const rDecA = mk(undefined, decodePlain);
const rDecA2 = mk(undefined, decodePlain);
const rDecB = mk(undefined, decodeCopied);

const P = { id: "42" };
const S = { tab: "x" };

// Correctness gate: the two arms must produce the SAME observable result, or
// the measurement is comparing different work.
const hrefA = rEncA.buildPath("u", P, S);
const hrefB = rEncB.buildPath("u", P, S);
const stA = getPluginApi(rDecA).matchPath("/u/42?tab=x");
const stB = getPluginApi(rDecB).matchPath("/u/42?tab=x");

console.log(
  `EQUIVALENCE encode: A=${hrefA} B=${hrefB} equal=${hrefA === hrefB}`,
);
console.log(
  `EQUIVALENCE decode: A=${JSON.stringify([stA?.params, stA?.search, stA?.path])} B=${JSON.stringify([stB?.params, stB?.search, stB?.path])} equal=${JSON.stringify(stA) === JSON.stringify(stB)}`,
);

bench("D1 encode · A baseline (no boundary copy)", () => {
  do_not_optimize(rEncA.buildPath("u", P, S));
});
bench("D1 encode · B with boundary copy", () => {
  do_not_optimize(rEncB.buildPath("u", P, S));
});
bench("D1 encode · A/A floor (same code as A)", () => {
  do_not_optimize(rEncA2.buildPath("u", P, S));
});

bench("D2 decode · A baseline (no boundary copy)", () => {
  do_not_optimize(getPluginApi(rDecA).matchPath("/u/42?tab=x"));
});
bench("D2 decode · B with boundary copy", () => {
  do_not_optimize(getPluginApi(rDecB).matchPath("/u/42?tab=x"));
});
bench("D2 decode · A/A floor (same code as A)", () => {
  do_not_optimize(getPluginApi(rDecA2).matchPath("/u/42?tab=x"));
});

void run();
