// Price of the (а)-shaped remedy for the registry handouts: freeze the cache
// entry ONCE at fill time (P4 — the level core produced), hand the same
// reference out. Two questions, same session, alternating arms:
//   1. does a frozen array read slower in the consumers' own loop shapes
//      (`findMisChanneledKey`: for..of + hasOwn; `admittedSearch` /
//      `withholdFilledSlots`: `includes`; `slotsShallowEqual`: for..of)?
//   2. what does one `Object.freeze` cost at fill, against the filter that
//      builds the entry (`queryParamsFor`'s `declared.filter(...)`)?
// An A/A pair (plain vs plain) calibrates the harness's own spread.
import { bench, group, run } from "mitata";

const hasOwn = Object.hasOwn;

const plain1 = ["tab"];
const frozen1 = Object.freeze(["tab"]);
const plainA1 = ["tab"];
const plain3 = ["tab", "page", "sort"];
const frozen3 = Object.freeze(["tab", "page", "sort"]);
const plainA3 = ["tab", "page", "sort"];
const bag = { id: "1", extra: "x" };
const query = { tab: "x", page: "2", nope: "3" };
const declared = ["lang", "tab", "page", "sort", "id"];
const urlParams = ["id"];

function guardLoop(params: Record<string, unknown>, names: readonly string[]): string | undefined {
  if (names.length === 0 || params == null) return undefined;
  for (const key of names) {
    if (!hasOwn(params, key)) continue;
    const value = params[key];
    if (value !== undefined) return key;
  }
  return undefined;
}

function includesLoop(search: Record<string, unknown>, names: readonly string[]): number {
  let admitted = 0;
  for (const key of Object.keys(search)) {
    if (names.includes(key)) admitted++;
  }
  return admitted;
}

let sink = 0;

group("guard loop (for..of + hasOwn) — 1 name", () => {
  bench("plain", () => { sink += guardLoop(bag, plain1) === undefined ? 1 : 0; });
  bench("frozen", () => { sink += guardLoop(bag, frozen1) === undefined ? 1 : 0; });
  bench("plain (A/A)", () => { sink += guardLoop(bag, plainA1) === undefined ? 1 : 0; });
});

group("guard loop (for..of + hasOwn) — 3 names", () => {
  bench("plain", () => { sink += guardLoop(bag, plain3) === undefined ? 1 : 0; });
  bench("frozen", () => { sink += guardLoop(bag, frozen3) === undefined ? 1 : 0; });
  bench("plain (A/A)", () => { sink += guardLoop(bag, plainA3) === undefined ? 1 : 0; });
});

group("includes loop (mode gate shape) — 3 names", () => {
  bench("plain", () => { sink += includesLoop(query, plain3); });
  bench("frozen", () => { sink += includesLoop(query, frozen3); });
  bench("plain (A/A)", () => { sink += includesLoop(query, plainA3); });
});

group("cache fill: filter vs filter+freeze (once per route per rebuild)", () => {
  bench("filter", () => { sink += declared.filter((p) => !urlParams.includes(p)).length; });
  bench("filter+freeze", () => { sink += Object.freeze(declared.filter((p) => !urlParams.includes(p))).length; });
  bench("filter (A/A)", () => { sink += declared.filter((p) => !urlParams.includes(p)).length; });
});

async function main(): Promise<void> {
  await run({ format: "markdown" });
  console.log(`sink=${sink}`);
}

void main();
