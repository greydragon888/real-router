// bundle-size-base.test.mjs — the base the Bundle Size job diffs a PR against.
//
// Run:  node --test scripts/bundle-size-base.test.mjs
//
// #2395's report compared the PR with a post-merge run six weeks old: the
// lookup took the first run the API listed, and nothing checked that run's
// commit. The first cell replays that answer; the rest pin the fallback a
// cancelled post-merge run makes necessary, and the refusal past it.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_DISTANCE,
  baseNote,
  chooseBaseRun,
  firstParentOfMerge,
} from "./bundle-size-base.mjs";

const sha = (c) => c.repeat(40);
const BASE = sha("b");

const run = (id, headSha, createdAt) => ({ id, headSha, createdAt });

/** A linear history: `order` lists commits oldest first. */
const linear = (order) => (ancestor, base) => {
  const from = order.indexOf(ancestor);
  const to = order.indexOf(base);

  return from === -1 || to === -1 || from > to ? null : to - from;
};

const noCompare = () => {
  throw new Error("an exact match must not need a compare call");
};

test("#2395: the run for the base commit wins, even when the API lists an old one first", () => {
  const runs = [
    run(30979695163, sha("a"), "2026-08-05T05:56:50Z"),
    run(35227889313, BASE, "2026-09-17T13:34:09Z"),
  ];

  assert.deepEqual(chooseBaseRun(BASE, runs, noCompare), {
    run: runs[1],
    distance: 0,
  });
});

test("the order runs arrive in does not matter", () => {
  const old = run(1, sha("1"), "2026-09-01T00:00:00Z");
  const near = run(2, sha("2"), "2026-09-10T00:00:00Z");
  const history = linear([sha("1"), sha("2"), BASE]);

  assert.deepEqual(chooseBaseRun(BASE, [old, near], history), {
    run: near,
    distance: 1,
  });
  assert.deepEqual(chooseBaseRun(BASE, [near, old], history), {
    run: near,
    distance: 1,
  });
});

test("with no build of the base, the closest ancestor is used and its distance reported", () => {
  const runs = [
    run(1, sha("1"), "2026-09-15T00:00:00Z"),
    run(2, sha("2"), "2026-09-16T00:00:00Z"),
    run(4, sha("4"), "2026-09-18T00:00:00Z"),
  ];
  const history = linear([sha("1"), sha("2"), sha("3"), BASE, sha("4")]);

  assert.deepEqual(chooseBaseRun(BASE, runs, history), {
    run: runs[1],
    distance: 2,
  });
});

test("runs on commits after the base, or off its history, are skipped", () => {
  const runs = [
    run(9, sha("9"), "2026-09-20T00:00:00Z"),
    run(8, sha("8"), "2026-09-19T00:00:00Z"),
    run(1, sha("1"), "2026-09-01T00:00:00Z"),
  ];
  const history = linear([sha("1"), BASE, sha("9")]);

  assert.deepEqual(chooseBaseRun(BASE, runs, history), {
    run: runs[2],
    distance: 1,
  });
});

test("an ancestor further than MAX_DISTANCE is refused, not used", () => {
  const far = run(1, sha("1"), "2026-08-05T00:00:00Z");

  assert.equal(
    chooseBaseRun(BASE, [far], () => MAX_DISTANCE + 1),
    null,
  );
  assert.deepEqual(
    chooseBaseRun(BASE, [far], () => MAX_DISTANCE),
    {
      run: far,
      distance: MAX_DISTANCE,
    },
  );
});

test("no run at all, or none on the base's history, is no base", () => {
  assert.equal(chooseBaseRun(BASE, [], noCompare), null);
  assert.equal(
    chooseBaseRun(BASE, [run(1, sha("1"), "2026-09-01T00:00:00Z")], () => null),
    null,
  );
});

test("the base is the merge commit's first parent, and a non-merge has none", () => {
  const merge = [
    `tree ${sha("t")}`,
    `parent ${sha("d")}`,
    `parent ${sha("e")}`,
    "author A <a@example.com> 1 +0000",
    "",
    "Merge e into d",
  ].join("\n");
  const single = [`tree ${sha("t")}`, `parent ${sha("d")}`, "", "x"].join("\n");

  assert.equal(firstParentOfMerge(merge), sha("d"));
  assert.equal(firstParentOfMerge(single), null);
  assert.equal(firstParentOfMerge(""), null);
});

test("the note names the base, and says so when it trails or is missing", () => {
  const exact = baseNote({
    baseSha: BASE,
    choice: { run: run(7, BASE, "x"), distance: 0 },
    runUrl: "https://example.test/runs/7",
  });

  assert.match(exact, /master@bbbbbbbbb/);
  assert.match(
    exact,
    /\[post-merge run 7\]\(https:\/\/example\.test\/runs\/7\)/,
  );
  assert.doesNotMatch(exact, /behind/);

  const trailing = baseNote({
    baseSha: BASE,
    choice: { run: run(7, sha("1"), "x"), distance: 3 },
    runUrl: "u",
  });

  assert.match(trailing, /master@111111111/);
  assert.match(trailing, /\*\*3 commits behind\*\*/);
  assert.match(trailing, /base `bbbbbbbbb`/);
  assert.match(
    baseNote({
      baseSha: BASE,
      choice: { run: run(7, sha("1"), "x"), distance: 1 },
      runUrl: "u",
    }),
    /\*\*1 commit behind\*\*/,
  );

  const missing = baseNote({ baseSha: BASE, choice: null });

  assert.match(missing, /Base unavailable/);
  assert.match(missing, /bbbbbbbbb/);
  assert.match(missing, new RegExp(`within ${String(MAX_DISTANCE)} commits`));
  assert.match(missing, /Every package below shows as new/);
  assert.match(
    baseNote({ baseSha: BASE, choice: null, reason: "gh failed" }),
    /Base unavailable\*\* — gh failed\./,
  );
});
