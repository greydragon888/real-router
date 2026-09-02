// Alternating PROCESSES, medians of medians, order flipped every pair.
//
//   node drive.mjs <bench> <left> <right> <arms,comma,separated> [pairs] [rounds]
//   node drive.mjs core    left leftA "buildPath-static,navigate"      # A/A floor
//   node drive.mjs core    left right "buildPath-static,navigate"      # the delta
//
// ⚠ Read the A/A floor FIRST, on the same arms, in the same sitting. A delta
// smaller than the floor is not a direction, and this rig has produced deltas
// that flipped sign between two runs of the same pair.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [, , KIND, LEFT, RIGHT, ARMS, PAIRS = "9", ROUNDS = "13"] = process.argv;
const bench = KIND === "plugins" ? "bench-plugins.mjs" : "bench-core.mjs";
const suffix = KIND === "plugins" ? "-plugins.mjs" : "-core.mjs";

const med = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const run = (side, arm) =>
  JSON.parse(
    execFileSync(
      "node",
      [path.join(HERE, bench), path.join(HERE, "out", side + suffix), arm, ROUNDS],
      { encoding: "utf8" },
    ),
  ).median;

for (const arm of ARMS.split(",")) {
  const l = [], r = [];
  for (let p = 0; p < Number(PAIRS); p++) {
    // The ORDER alternates too, so a warming trend cannot favour one side.
    if (p % 2 === 0) { l.push(run(LEFT, arm)); r.push(run(RIGHT, arm)); }
    else { r.push(run(RIGHT, arm)); l.push(run(LEFT, arm)); }
  }
  const ml = med(l), mr = med(r);
  console.log(
    `${arm.padEnd(22)} ${LEFT}=${ml.toFixed(1)}ns  ${RIGHT}=${mr.toFixed(1)}ns  ` +
      `delta=${(((mr - ml) / ml) * 100).toFixed(2)}%`,
  );
}
