// CANNOT-AFFORD check for the registry-array doors (getQueryParams·return,
// port().queryNames·return, port().pathNames·return): the two fix shapes are
// (i) freeze the cached array once at cache insertion (helpers.ts · urlParamsFor /
// queryParamsFor) and keep handing the handle out, or (ii) copy per hand-out.
// Measured: the per-call read the hot paths do on the array (`includes`, one to
// three names — channels/guard.ts · findMisChanneledKey, channels/modeGate.ts ·
// admittedSearch, channels/defaults.ts · withholdFilledSlots) on a frozen vs a
// plain array, and the one-time build cost with and without the freeze, against a
// copy-per-call. mitata; medians in the printed table.
import { bench, do_not_optimize, run } from "mitata";

const plain1 = ["tab"];
const frozen1 = Object.freeze(["tab"]);
const plain3 = ["a", "b", "tab"];
const frozen3 = Object.freeze(["a", "b", "tab"]);

bench("includes hit · plain[1]", () => do_not_optimize(plain1.includes("tab")));
bench("includes hit · frozen[1]", () => do_not_optimize(frozen1.includes("tab")));
bench("includes miss · plain[3]", () => do_not_optimize(plain3.includes("zz")));
bench("includes miss · frozen[3]", () => do_not_optimize(frozen3.includes("zz")));
bench("for-of · plain[3]", () => {
  let n = 0;

  for (const k of plain3) {
    if (k === "zz") {
      n += 1;
    }
  }

  do_not_optimize(n);
});
bench("for-of · frozen[3]", () => {
  let n = 0;

  for (const k of frozen3) {
    if (k === "zz") {
      n += 1;
    }
  }

  do_not_optimize(n);
});
bench("handout · return handle", () => do_not_optimize(frozen1));
bench("handout · copy per call [1]", () => do_not_optimize([...plain1]));
bench("handout · copy per call [3]", () => do_not_optimize([...plain3]));
bench("build once · new array [1]", () => do_not_optimize(["tab"]));
bench("build once · new array + freeze [1]", () =>
  do_not_optimize(Object.freeze(["tab"])),
);
bench("build once · filter [3]→[3]", () =>
  do_not_optimize(plain3.filter((k) => k !== "zz")),
);
bench("build once · filter [3]→[3] + freeze", () =>
  do_not_optimize(Object.freeze(plain3.filter((k) => k !== "zz"))),
);

async function main(): Promise<void> {
  await run();
}

void main();
