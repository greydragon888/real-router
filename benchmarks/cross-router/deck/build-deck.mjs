import { readFileSync, writeFileSync } from "node:fs";
const DIR = import.meta.dirname;
const tpl = readFileSync(`${DIR}/deck-config.js`, "utf8");
const { META, DATA, GRID, SWEEP } = JSON.parse(readFileSync(`${DIR}/deck-data.json`, "utf8"));
let cfg = tpl
  .replace("__META__", JSON.stringify(META ?? null))   // O-10б: machine/provenance stamp (null on pre-META data)
  .replace("__SWEEP__", JSON.stringify(SWEEP))
  .replace("__GRID__", JSON.stringify(GRID))
  .replace("__DATA__", JSON.stringify(DATA))
  .trimEnd();
if (["__META__", "__SWEEP__", "__GRID__", "__DATA__"].some((p) => cfg.includes(p)))
  throw new Error("unreplaced placeholder remains");

let html = readFileSync(`${DIR}/deck.html`, "utf8");
const start = html.indexOf("  const GROUPS=[");
if (start < 0) throw new Error("GROUPS anchor not found");
const dataIdx = html.indexOf("  const DATA=", start);
if (dataIdx < 0) throw new Error("DATA anchor not found");
const eol = html.indexOf("\n", dataIdx);
if (eol < 0) throw new Error("DATA line end not found");
html = html.slice(0, start) + cfg + html.slice(eol);
writeFileSync(`${DIR}/deck.html`, html);
console.log("spliced config block:", cfg.length, "chars; deck.html:", html.length, "chars");
