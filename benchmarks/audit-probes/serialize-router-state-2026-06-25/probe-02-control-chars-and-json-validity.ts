/**
 * Probe 02 — completes the XSS Safety Matrix rows that involve control bytes
 * and BOM, plus confirms U+2028/U+2029 remain JSON-valid (the gap is parse-time
 * on pre-ES2019 engines, NOT an injection/JSON-validity issue).
 *
 * Lives in a file (not `tsx -e`) because literal control bytes on the shell
 * command line are rejected — here they are built via String.fromCharCode.
 *
 * Run: npx tsx benchmarks/audit-probes/serialize-router-state-2026-06-25/probe-02-control-chars-and-json-validity.ts
 */

import { serializeState } from "../../../../packages/core/src/utils/index";

const NUL = String.fromCharCode(0);
const SOH = String.fromCharCode(1);
const US = String.fromCharCode(0x1f);
const BOM = String.fromCharCode(0xfeff);
const U2028 = String.fromCharCode(0x2028);
const U2029 = String.fromCharCode(0x2029);

const parseOk = (s: string): boolean => {
  try {
    JSON.parse(s);

    return true;
  } catch {
    return false;
  }
};

// NULL + control chars: JSON.stringify must escape U+0000..U+001F per JSON spec.
const ctrl = serializeState({ a: `x${NUL}${SOH}${US}y` });
console.log("control output:", JSON.stringify(ctrl));
console.log("NUL escaped to \\u0000:", ctrl.includes("\\u0000"));
console.log("SOH escaped to \\u0001:", ctrl.includes("\\u0001"));
console.log("US escaped to \\u001f:", ctrl.includes("\\u001f"));
console.log("no raw control byte survives:", !ctrl.includes(NUL) && !ctrl.includes(SOH) && !ctrl.includes(US));
console.log("JSON.parse ok:", parseOk(ctrl));
console.log("VERDICT (NUL/control): escaped by JSON.stringify, valid JSON, no XSS vector → SAFE\n");

// BOM (U+FEFF): a normal char inside a JSON string value — passes raw, valid JSON.
const bom = serializeState({ a: `x${BOM}y` });
console.log("BOM passes raw:", bom.includes(BOM), "| JSON.parse ok:", parseOk(bom));
console.log("VERDICT (BOM): raw but JSON-valid, not an injection vector → SAFE (no escape needed)\n");

// U+2028/U+2029: NOT escaped, but JSON-valid (the gap is JS-literal parse on
// pre-ES2019 engines, already shown in probe-01 Q3 to be a non-issue on V8).
const ls = serializeState({ a: `x${U2028}${U2029}y` });
console.log("U+2028 raw survives:", ls.includes(U2028), "| U+2029 raw survives:", ls.includes(U2029));
console.log("JSON.parse ok:", parseOk(ls));
console.log("VERDICT (U+2028/29): NOT escaped, but JSON-valid — gap is pre-ES2019 JS-literal parse only → LOW\n");

console.log("── done ──");
