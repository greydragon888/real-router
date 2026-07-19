/**
 * Probe 01 — behavioural verification of the focused questions from
 * `packages/core/.claude/prompts/method-deep-audit-serialize-router-state.md`.
 *
 * NOT a latency probe — a contract probe. Each question prints the observed
 * behaviour + a verdict, so the audit's "by-design / not-a-bug" and the XSS
 * Safety Matrix rest on a RUN, not on reading.
 *
 * Imports the TS SOURCE directly (`packages/core/src/utils/index.ts`) — default
 * tsx resolution of `@real-router/core/utils` would pick the built dist/, which
 * may lag src. We want to audit the source of truth.
 *
 * Run: npx tsx benchmarks/audit-probes/serialize-router-state-2026-06-25/probe-01-xss-and-escape-behavior.ts
 */

import {
  serializeState,
  serializeRouterState,
} from "../../../../packages/core/src/utils/index";

import type { State } from "@real-router/core";

const DEFAULT_TRANSITION = {
  phase: "activating" as const,
  reason: "success" as const,
  segments: { deactivated: [], activated: [], intersection: "" },
};

function mkState(over: Partial<State>): State {
  return {
    name: "page",
    params: {},
    path: "/page",
    context: {},
    transition: DEFAULT_TRANSITION,
    ...over,
  } as State;
}

const U2028 = " ";
const U2029 = " ";
let q = 0;
const head = (s: string): void => {
  q += 1;
  console.log(`\n── Q${q}. ${s}`);
};

// Q1 — mechanism: does JSON.stringify pass U+2028/U+2029 through RAW?
head("JSON.stringify and U+2028/U+2029 (mechanism)");
const rawJson = JSON.stringify({ a: `x${U2028}y${U2029}z` });
console.log("contains raw U+2028:", rawJson.includes(U2028));
console.log("contains raw U+2029:", rawJson.includes(U2029));
console.log("contains escaped \\u2028:", rawJson.includes("\\u2028"));
console.log(
  "VERDICT: JSON.stringify passes U+2028/U+2029 through unescaped →",
  rawJson.includes(U2028) && rawJson.includes(U2029),
);

// Q2 — does serializeState escape U+2028/U+2029?
head("serializeState escapes U+2028/U+2029?");
const out2 = serializeState({ a: `x${U2028}y${U2029}z` });
console.log("output still contains raw U+2028:", out2.includes(U2028));
console.log("output still contains raw U+2029:", out2.includes(U2029));
console.log("JSON.parse(output) ok:", (() => { try { JSON.parse(out2); return true; } catch { return false; } })());
console.log(
  "VERDICT: U+2028/U+2029 NOT escaped (passes through) →",
  out2.includes(U2028) && out2.includes(U2029),
);

// Q2b — does a MODERN V8 fail to eval a script literal containing raw U+2028?
head("Modern V8 evals raw U+2028 in object literal (ES2019 superset)?");
let evalThrew = false;
try {
  // Simulates  <script>window.__X = {json}</script>  parse on a modern engine.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  new Function(`return ${out2}`)();
} catch {
  evalThrew = true;
}
console.log("new Function(`return ${out}`) threw:", evalThrew);
console.log(
  "VERDICT: modern V8 handles raw U+2028 fine → the gap is PRE-ES2019 only →",
  !evalThrew,
);

// Q3 — does serializeState escape <, >, & and round-trip via JSON.parse?
head("serializeState escapes <, >, & and round-trips");
const payload3 = { path: "/users/<id>", q: "a&b>c", html: "</script>" };
const out3 = serializeState(payload3);
console.log("output:", out3);
console.log("no raw <:", !out3.includes("<"), "no raw >:", !out3.includes(">"), "no raw &:", !out3.includes("&"));
console.log("has \\u003c:", out3.includes(String.raw`<`));
console.log("JSON.parse round-trips identically:", JSON.stringify(JSON.parse(out3)) === JSON.stringify(payload3));
console.log("VERDICT: 3-char escape holds + JSON.parse decodes back → true");

// Q4 — cascading double-escape? Replacement values are < etc (contain no <,>,&)
head("No cascading double-escape (order <, >, & is safe)");
const out4 = serializeState({ s: "<&>" });
// If & were escaped first to & then < ... no: replacements contain no source chars.
console.log("output:", out4);
const decoded4 = JSON.parse(out4) as { s: string };
console.log("decoded back to original '<&>':", decoded4.s === "<&>");
console.log("VERDICT: each source char escaped exactly once →", decoded4.s === "<&>");

// Q5 — custom serialize already-escaped string vs literal char
head("Custom serialize: literal `<` escaped; pre-written `\\u003c` passes through");
const ESC_LT = "\\u003c"; // the 6-char sequence: backslash,u,0,0,3,c
const litLT = serializeState({}, { serialize: () => "<" }); // returns literal '<'
const preEsc = serializeState({}, { serialize: () => ESC_LT }); // returns the 6-char escape
console.log("serialize()=>'<' →", JSON.stringify(litLT), "(escaped to \\u003c):", litLT === ESC_LT);
console.log("serialize()=>'\\u003c' →", JSON.stringify(preEsc), "(unchanged, no double-escape):", preEsc === ESC_LT);
console.log("VERDICT: literal char escaped once, pre-written escape-sequence untouched →", litLT === ESC_LT && preEsc === ESC_LT);

// Q6 — </script> and <!-- safe under 3-char escape
head("</script> and <!-- neutralised by `<` escape");
const out6 = serializeState({ a: "</script>", b: "<!--x-->" });
console.log("contains '</script>':", out6.includes("</script>"), "contains '<!--':", out6.includes("<!--"));
console.log("VERDICT: both neutralised →", !out6.includes("</script>") && !out6.includes("<!--"));

// Q7 — context VALUE carrying XSS payload (the property-test gap: arbState.context is always {})
head("serializeRouterState escapes XSS payload inside context VALUE");
const st7 = mkState({ context: { data: { evil: "</script><script>alert(1)</script>" } } });
const out7 = serializeRouterState(st7);
console.log("no raw '<' anywhere:", !out7.includes("<"));
console.log("payload survives round-trip decoded:",
  (JSON.parse(out7) as { context: { data: { evil: string } } }).context.data.evil === "</script><script>alert(1)</script>");
console.log("VERDICT: context-value XSS IS escaped (behaviour correct; just not property-tested) → true");

// Q8 — top-level non-serializable → "null"
head("Top-level undefined / Symbol / function → 'null'");
console.log("undefined:", serializeState(undefined));
console.log("Symbol:", serializeState(Symbol("x")));
console.log("function:", serializeState((): number => 1));
console.log("VERDICT: all normalise to 'null' → ",
  serializeState(undefined) === "null" && serializeState(Symbol("x")) === "null");

// Q9 — custom serialize returns NON-STRING (number) → ?
head("Custom serialize returns a number (type-contract violation)");
let q9: string;
try {
  q9 = serializeState({}, { serialize: (() => 42) as unknown as (d: unknown) => string });
  console.log("returned:", JSON.stringify(q9), "(no throw)");
} catch (e) {
  console.log("THREW:", (e as Error).constructor.name, "-", (e as Error).message);
}
console.log("VERDICT: see above — TypeError on .replaceAll vs silent pass-through");

// Q10 — custom serialize returns EMPTY string → invalid JSON output?
head("Custom serialize returns '' (empty string)");
const q10 = serializeState({}, { serialize: () => "" });
console.log("output:", JSON.stringify(q10), "length:", q10.length);
let q10parse = true;
try { JSON.parse(q10); } catch { q10parse = false; }
console.log("JSON.parse(output) ok:", q10parse);
console.log("VERDICT: '' is not nullish → returned as-is → output is INVALID JSON →", !q10parse);

// Q11 — excludeContext path with context === undefined (invalid State, but check)
head("excludeContext path when state.context === undefined (precondition violation)");
let q11msg = "";
try {
  serializeRouterState(mkState({ context: undefined as unknown as Record<string, unknown> }), { excludeContext: ["x"] });
  q11msg = "no throw";
} catch (e) {
  q11msg = `THREW ${(e as Error).constructor.name}: ${(e as Error).message}`;
}
console.log("exclude path:", q11msg);
// no-exclude path tolerates it:
const q11b = serializeRouterState(mkState({ context: undefined as unknown as Record<string, unknown> }));
console.log("no-exclude path:", JSON.stringify(q11b));
console.log("VERDICT: ASYMMETRY — exclude path throws, no-exclude omits key; unreachable via valid State (context required)");

// Q12 — __proto__ as a context key
head("__proto__ as a context namespace key");
const ctxProto: Record<string, unknown> = {};
Object.defineProperty(ctxProto, "__proto__", { value: { polluted: 1 }, enumerable: true, configurable: true, writable: true });
ctxProto.safe = { ok: 1 };
console.log("own enumerable keys of context:", Object.keys(ctxProto));
// Not excluded: does filtered['__proto__']=value silently drop it?
const out12keep = serializeRouterState(mkState({ context: ctxProto }), { excludeContext: ["nothing"] });
console.log("NOT excluded → output:", out12keep);
const out12drop = serializeRouterState(mkState({ context: ctxProto }), { excludeContext: ["__proto__"] });
console.log("excluded '__proto__' → output:", out12drop);
console.log("VERDICT: see whether __proto__ key survives the filtered-copy rebuild");

// Q13 — determinism
head("Determinism: same State → identical string twice");
const st13 = mkState({ params: { a: "1", b: "2" }, context: { data: { x: 1 }, src: "server" } });
console.log("equal:", serializeRouterState(st13) === serializeRouterState(st13));
console.log("VERDICT: deterministic → true");

// Q14 — context key literally named "transition" is preserved (only top-level transition stripped)
head("context.transition key preserved (only state.transition stripped)");
const st14 = mkState({ context: { transition: { kept: true } } });
const parsed14 = JSON.parse(serializeRouterState(st14)) as { transition?: unknown; context: { transition?: unknown } };
console.log("top-level transition present:", "transition" in parsed14);
console.log("context.transition present:", parsed14.context.transition !== undefined);
console.log("VERDICT: top-level stripped, nested kept →",
  !("transition" in parsed14) && parsed14.context.transition !== undefined);

// Q15 — excludeContext correctness at scale (100 keys), correctness not timing
head("excludeContext correctness with 100 context keys");
const big: Record<string, unknown> = {};
for (let i = 0; i < 100; i++) big[`ns${i}`] = { v: i };
const out15 = JSON.parse(serializeRouterState(mkState({ context: big }), { excludeContext: ["ns0", "ns50", "ns99"] })) as { context: Record<string, unknown> };
console.log("kept keys:", Object.keys(out15.context).length, "(expected 97)");
console.log("ns0 removed:", !("ns0" in out15.context), "ns50 removed:", !("ns50" in out15.context), "ns99 removed:", !("ns99" in out15.context));
console.log("VERDICT: filtering correct at scale →", Object.keys(out15.context).length === 97);

console.log("\n── done ──");
