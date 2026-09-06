import { readFileSync } from "node:fs";

// Location-independent: the probe directory is this file's parent's parent.
const base = new URL("..", import.meta.url).pathname;
const fam = JSON.parse(readFileSync(base + "/_regroup/fam.json", "utf8"));
const census = JSON.parse(readFileSync(base + "/_census/census.json", "utf8"));

const all = [];
for (const k of Object.keys(fam)) all.push(...fam[k]);
console.log("families", Object.keys(fam).length, "total", all.length, "unique", new Set(all).size);
console.log("dups", JSON.stringify(all.filter((x, i) => all.indexOf(x) !== i)));
for (const k of Object.keys(fam)) console.log("  size", k, fam[k].length);

const cens = new Set(census.doors.map((d) => d.id));
const mine = new Set(all);
console.log("--- mine NOT in census (expect: critic additions):");
for (const x of mine) if (!cens.has(x)) console.log("  +", x);
console.log("--- census NOT in mine (expect: triage-dropped):");
for (const d of census.doors) if (!mine.has(d.id)) console.log("  -", d.id, "|", d.family);
