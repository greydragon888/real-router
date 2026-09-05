/**
 * Per-call cost of the ingestion primitive, on the shapes the predicate path
 * actually hands it (#2116, required verbatim by #1901).
 *
 * #1901 asks for this number and never got it: *"Some ingestion doors run per
 * `<Link>` per render. Measure the per-call cost against the doors that are on
 * that path and report it — a primitive that is right and unaffordable on the
 * predicate path has to say so, and that is a design input, not a defect."*
 *
 * ⚑ **The arms are paired against what the door would otherwise write**, not
 * against each other. A primitive is affordable if the delta against the plain
 * form it replaces is small on the shape that door sees — so each `putField`
 * arm has a plain-assignment twin on the same target shape and the same key
 * mix, and the answer is the difference.
 *
 * ⚑ **`Object.assign` is the baseline, and the spread arm beside it is NOT.**
 * `copyFields` exists because `Object.assign` is the hazard — it copies with
 * `[[Set]]`, one key at a time, which is the form `putField` guards. So the
 * affordability question is "what does the guard cost against the call it
 * replaces", and that call is `Object.assign`. `{ ...source }` is a different
 * operation: one optimised object-literal build rather than N `[[Set]]`s,
 * measured here at roughly a QUARTER of `Object.assign`'s time, and it is kept
 * as its own arm so the two are never read as interchangeable.
 *
 * ⚠ **The target's prototype decides which branch runs, and the two are not the
 * same price.** On a plain `{}` target an inherited name takes the
 * `defineProperty` branch; on an `Object.create(null)` target `key in target` is
 * false for every name, so the define branch is unreachable and `putField`
 * degenerates to assignment plus two wasted checks. That is why the null-proto
 * arms are here at all: they price WIRING a door that already has the guarantee
 * by construction.
 */
import { batched, isMain, keep, makeBench, settleHeap } from "./fixtures";
import { copyFields, putField } from "../../src/utils/ingest";

/** The mix a route's own query/param names produce: ordinary, plus the two that inherit. */
const ORDINARY = ["id", "page", "sort", "filter", "limit"];
const INHERITED = ["__proto__", "constructor"];

export async function run(): Promise<void> {
  const bench = makeBench("ingest-primitive");
  const ITER = 1000;

  // ── plain `{}` target — the shape `channels/` writes into ──────────────────
  bench.add(
    "putField/plain-target/ordinary-keys",
    batched(ITER, () => {
      const target: Record<string, unknown> = {};

      for (const key of ORDINARY) {
        putField(target, key, 1);
      }

      keep(target);
    }),
  );

  bench.add(
    "assign/plain-target/ordinary-keys",
    batched(ITER, () => {
      const target: Record<string, unknown> = {};

      for (const key of ORDINARY) {
        target[key] = 1;
      }

      keep(target);
    }),
  );

  bench.add(
    "putField/plain-target/with-inherited-names",
    batched(ITER, () => {
      const target: Record<string, unknown> = {};

      for (const key of [...ORDINARY, ...INHERITED]) {
        putField(target, key, 1);
      }

      keep(target);
    }),
  );

  // ── `Object.create(null)` target — the shape `dependenciesStore` writes into ─
  bench.add(
    "putField/null-proto-target/ordinary-keys",
    batched(ITER, () => {
      const target = Object.create(null) as Record<string, unknown>;

      for (const key of ORDINARY) {
        putField(target, key, 1);
      }

      keep(target);
    }),
  );

  bench.add(
    "assign/null-proto-target/ordinary-keys",
    batched(ITER, () => {
      const target = Object.create(null) as Record<string, unknown>;

      for (const key of ORDINARY) {
        target[key] = 1;
      }

      keep(target);
    }),
  );

  // ── whole-record copy ──────────────────────────────────────────────────────
  const source: Record<string, unknown> = {
    id: 1,
    page: 2,
    sort: 3,
    filter: 4,
    limit: 5,
  };

  bench.add(
    "copyFields/plain-target",
    batched(ITER, () => {
      const target: Record<string, unknown> = {};

      copyFields(target, source);
      keep(target);
    }),
  );

  bench.add(
    "Object.assign/plain-target",
    batched(ITER, () => {
      const target: Record<string, unknown> = {};

      // eslint-disable-next-line unicorn/no-immediate-mutation -- the point of this arm IS the `Object.assign` call; the rule's autofix rewrites it to `{ ...source }`, a different operation, and leaves the arm name saying otherwise
      Object.assign(target, source);
      keep(target);
    }),
  );

  bench.add(
    "spread/plain-target",
    batched(ITER, () => {
      keep({ ...source });
    }),
  );

  // ── realistic bag sizes on the MATCHING hot path ──────────────────────────
  // `copyFields` sits in `SegmentMatcher.#traverseFrom` and `#matchSplat`, and
  // a route's params bag there is one or two keys, not five. The five-key arms
  // above price the PRIMITIVE; these price the DOOR.
  const bags: readonly (readonly [string, Record<string, unknown>])[] = [
    ["1-key", { id: 1 }],
    ["2-key", { id: 1, page: 2 }],
  ];

  for (const [label, bag] of bags) {
    bench.add(
      `copyFields/${label}`,
      batched(ITER, () => {
        const target: Record<string, unknown> = {};

        copyFields(target, bag);
        keep(target);
      }),
    );

    bench.add(
      `Object.assign/${label}`,
      batched(ITER, () => {
        const target: Record<string, unknown> = {};

        // eslint-disable-next-line unicorn/no-immediate-mutation -- see the 5-key arm above
        Object.assign(target, bag);
        keep(target);
      }),
    );
  }

  await settleHeap();
  await bench.run();
  console.table(bench.table());
}

if (isMain(__filename)) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
