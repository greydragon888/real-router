import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
const DIR = import.meta.dirname;
const OUT = `${DIR}/out`; // gitignored generated outputs (deck.html / print.html / deck-data.json / the PDF), apart from the tracked source in deck/
mkdirSync(OUT, { recursive: true });
const tpl = readFileSync(`${DIR}/deck-config.js`, "utf8");
const { META, DATA, GRID, SWEEP, VERSIONS } = JSON.parse(readFileSync(`${OUT}/deck-data.json`, "utf8"));
const cfg = tpl
  .replace("__META__", JSON.stringify(META ?? null))   // O-10б: machine/provenance stamp (null on pre-META data)
  .replace("__SWEEP__", JSON.stringify(SWEEP))
  .replace("__GRID__", JSON.stringify(GRID))
  .replace("__DATA__", JSON.stringify(DATA))
  .replace("__VERSIONS__", JSON.stringify(VERSIONS ?? {}))   // measured router versions (empty {} on pre-version data → deck falls back to its seed FIELD labels)
  .trimEnd();
if (["__META__", "__SWEEP__", "__GRID__", "__DATA__", "__VERSIONS__"].some((p) => cfg.includes(p)))
  throw new Error("unreplaced placeholder remains");

// Shared render, inlined at each shell's `//__RENDER__` marker (CSP: no <script src>).
const render = readFileSync(`${DIR}/deck-render.js`, "utf8");

// Splice the config block into a shell's `const GROUPS=[` … `const DATA=` region, inline the
// shared render, write the page. Both the interactive deck (deck-shell.html) and the print/
// PDF edition (print-shell.html) are built from the SAME config + render — one source, two
// outputs. deck.html / print.html are gitignored generated artifacts; the shells + config +
// render are the tracked source. A shell without the `//__RENDER__` marker just skips the
// inline (its render stays inline) — so this stays correct mid-refactor.
function buildOne(shellFile, outFile) {
  let html = readFileSync(`${DIR}/${shellFile}`, "utf8");
  const start = html.indexOf("  const GROUPS=[");
  if (start < 0) throw new Error(`GROUPS anchor not found in ${shellFile}`);
  const dataIdx = html.indexOf("  const DATA=", start);
  if (dataIdx < 0) throw new Error(`DATA anchor not found in ${shellFile}`);
  const eol = html.indexOf("\n", dataIdx);
  if (eol < 0) throw new Error(`DATA line end not found in ${shellFile}`);
  html = html.slice(0, start) + cfg + html.slice(eol);
  // function replacer: the render text contains "$1" (NT's replacement) — a string replacer
  // would treat $1/$& as backreferences; a function's return value is inserted verbatim.
  html = html.replace("//__RENDER__", () => render);
  writeFileSync(`${OUT}/${outFile}`, html);
  console.log(`out/${outFile}: ${html.length} chars`);
}

buildOne("deck-shell.html", "deck.html");
if (existsSync(`${DIR}/print-shell.html`)) buildOne("print-shell.html", "print.html");
