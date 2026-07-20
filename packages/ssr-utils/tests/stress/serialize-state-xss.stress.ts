import { describe, expect, it } from "vitest";

import { serializeState } from "@real-router/ssr-utils";

import { measureTime } from "./helpers";

/**
 * XSS-escape correctness at scale for `serializeState` (the SSR/SSG boot path).
 *
 * `serializeState` embeds app/router state into an inline `<script>` via three
 * GLOBAL escapes — `<`→`<`, `>`→`>`, `&`→`&`
 * (`src/utils/serializeState.ts:59-62`). Those `replaceAll`s are the ONLY barrier
 * against `</script>` breakout / HTML-entity injection in the server-rendered
 * HTML, and they run on app-supplied data of unbounded size.
 *
 * Why a STRESS test (not redundant with `serializeState.test.ts`): the functional
 * suite asserts `expect(result).toContain("<")` — that AT LEAST ONE
 * dangerous char was escaped. That passes even if a global `replaceAll`
 * regresses to a single-occurrence `replace`: with N copies of `<`, only the
 * first is escaped, `.toContain` is still satisfied, and N-1 raw `<` leak into
 * the HTML — a live XSS. The round-trip test does not catch it either (`<`/`>`/`&`
 * are valid inside a JSON string, so an under-escaped payload still re-parses).
 * Only MANY occurrences + an EXHAUSTIVE "zero raw dangerous char remains"
 * assertion discriminates that regression. Canonical "stress catches what a
 * functional N=1 test cannot", on a security-critical path.
 *
 * Discrimination is CORRECTNESS-at-scale, not timing: the escaped output must
 * contain ZERO raw `<`/`>`/`&` and EXACTLY as many escape sequences as the
 * pre-escape serialization had raw chars (independent oracle: count on
 * `JSON.stringify`). Mutating `replaceAll`→`replace` in `serializeState.ts`
 * leaves N-1 raw chars → the "zero raw" + exact-count asserts trip. The wallclock
 * line is a generous catastrophe guard ONLY — the escape is O(n) by construction
 * (three linear string passes), so there is no quadratic to anchor a tight bound.
 */
describe("S27. serializeState XSS-escape correctness at scale", () => {
  // Each token contributes 2× `<` (`</script>`, `<img …>`), 2× `>` and 1× `&`.
  const TOKEN = "</script><img src=x onerror=alert(1)>&amp;";
  const N = 50_000;

  it(`escapes every one of >${N} dangerous chars — zero raw <, >, & survive`, () => {
    const attack = TOKEN.repeat(N);
    // Dangerous chars sit in a string param AND a top-level field, so the escape
    // must cover the whole serialized payload, not just one slot.
    const state = {
      name: "home",
      path: "/x",
      params: { q: attack },
      evil: attack,
    };

    // Independent oracle: count raw dangerous chars on the UN-escaped
    // serialization (exactly what serializeState's JSON.stringify produces and
    // then escapes over), so the expected escape counts are derived, not mirrored.
    const raw = JSON.stringify(state);
    const expectedLt = (raw.match(/</g) ?? []).length;
    const expectedGt = (raw.match(/>/g) ?? []).length;
    const expectedAmp = (raw.match(/&/g) ?? []).length;

    // The payload genuinely exercises all three escapes far past N (so a
    // single-occurrence `replace` regression leaves a huge raw residue).
    expect(expectedLt).toBeGreaterThan(N);
    expect(expectedGt).toBeGreaterThan(N);
    expect(expectedAmp).toBeGreaterThan(N);

    const { result, durationMs } = measureTime(() => serializeState(state));

    // (1) EXHAUSTIVE: not one raw dangerous char survives. This is the assertion
    // the functional `.toContain` lacks — it is what trips on replaceAll→replace.
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
    expect(result).not.toContain("&");

    // (2) The literal breakout token must be gone from the embeddable output.
    expect(result).not.toContain("</script>");

    // (3) Exact counts: every raw char became its escape — none dropped/doubled.
    expect(result.match(/\\u003c/g) ?? []).toHaveLength(expectedLt);
    expect(result.match(/\\u003e/g) ?? []).toHaveLength(expectedGt);
    expect(result.match(/\\u0026/g) ?? []).toHaveLength(expectedAmp);

    // (4) Catastrophe-only timing guard (escape is O(n) — three linear passes).
    expect(
      durationMs,
      `escape of ${formatLength(result.length)} took ${durationMs.toFixed(1)}ms`,
    ).toBeLessThan(500);
  });
});

function formatLength(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M chars` : `${n} chars`;
}
