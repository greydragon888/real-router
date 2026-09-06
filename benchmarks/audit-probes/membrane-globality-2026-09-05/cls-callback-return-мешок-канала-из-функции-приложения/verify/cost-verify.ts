// VERIFY of the classifier's cost arm on D1 (Route.encodeParams·return).
// Objection under test: the classifier emulated the boundary copy with a SPREAD,
// while strategy (а) in this tree is spelled `objectKeys` + `putField`
// (helpers.ts · normalizeChannel). `putField` is a [[DefineOwnProperty]], dearer
// than a spread — so the classifier's number may understate the copy.
// Arms: A baseline, A/A floor placed SECOND (the classifier's floor was always
// third — positional bias), B spread copy, C normalizeChannel-shaped copy.
import { createRouter } from "@real-router/core";
import { bench, do_not_optimize, run } from "mitata";

import { putField } from "../../../../../packages/core/src/utils/ingest";

type Ch = { params: Record<string, unknown>; search: Record<string, unknown> };

const encodePlain = (ch: Ch): Ch => ({
  params: { id: String(ch.params.id).toUpperCase() },
  search: ch.search,
});
const encodeSpread = (ch: Ch): Ch => {
  const r = encodePlain(ch);

  return { params: { ...r.params }, search: { ...r.search } };
};
// normalizeChannel's shape, minus the UNSAFE_KEY skip and the lazy alloc
const norm = (bag: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(bag)) {
    const value = bag[key];

    if (value !== undefined) putField(out, key, value);
  }

  return out;
};
const encodeDefine = (ch: Ch): Ch => {
  const r = encodePlain(ch);

  return { params: norm(r.params), search: norm(r.search) };
};

const mk = (encode: unknown): ReturnType<typeof createRouter> =>
  createRouter([
    { name: "u", path: "/u/:id?tab", encodeParams: encode },
  ] as never);

const rA = mk(encodePlain);
const rA2 = mk(encodePlain);
const rB = mk(encodeSpread);
const rC = mk(encodeDefine);

const P = { id: "42" };
const S = { tab: "x" };

console.log(
  `EQUIVALENCE A=${rA.buildPath("u", P, S)} B=${rB.buildPath("u", P, S)} C=${rC.buildPath("u", P, S)}`,
);

bench("A baseline", () => {
  do_not_optimize(rA.buildPath("u", P, S));
});
bench("A/A floor (second position)", () => {
  do_not_optimize(rA2.buildPath("u", P, S));
});
bench("B spread copy", () => {
  do_not_optimize(rB.buildPath("u", P, S));
});
bench("C putField copy (normalizeChannel shape)", () => {
  do_not_optimize(rC.buildPath("u", P, S));
});

void run();
