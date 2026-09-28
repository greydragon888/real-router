// Metric-family classification for RME gating — ONE policy consumed by both
// rme-gate.mjs (the pass/fail gate) and ci-summary.mjs (the informational noise watch),
// so the two cannot drift apart again: c5fe977e changed the gate's rules and left the
// watch on the old ones (audit 07-18 K16).
//
// Families:
//   • sweep-point — SINGLE-NAV-PER-SIZE sweep points (wide/deep/search `<metric>@N`):
//     each point times ONE navigation (after the in-realm WARM_NAVS warm-up), so a
//     point's absolute RME is single-nav quantization noise, NOT instability
//     (`navMsWall@N` is perf.now ~100 µs clamp-quantized; the 07-18 CI run saw svelte
//     search `blinkMs@32` at 53 % on consistent hardware). The scaling CURVE is what
//     matters — report-only, never a gate failure.
//     ⚠ Scenario-scoped ON PURPOSE (audit 07-18 K4): a blanket /@\d+$/ rule silently
//     ungated NON-single-nav @N families — cold-start's @10 keys (n full-boot samples),
//     table-heap `jsHeapMB@100` (retained, rme≈0), link-build `mountMs@N` and the
//     N-summed active-links/nested-switch windows — 5/13 deck GRID rows without a gate.
//   • noisy — inherently jittery families (CDP Blink trace, wall-clock latency, FCP) +
//     the windowed sweeps' `navMs*/scriptMs@N` points: looser bound, still gated so
//     EGREGIOUS instability (or a broken measurement pipeline) fails the run.
//   • stable — everything else (heap, mount, boot script, per-nav navMsWall/navMsTask).
export const RME_STABLE_DEFAULT = 15;
export const RME_NOISY_DEFAULT = 40;

export const SINGLE_NAV_SWEEPS = new Set([
  "wide-config",
  "deep-config",
  "search-param-scaling",
]);

export function familyOf(scenario, key) {
  if (SINGLE_NAV_SWEEPS.has(scenario) && /@\d+$/.test(key)) return "sweep-point";
  if (/blink|latency|fcp/i.test(key)) return "noisy";
  // Windowed-sweep @N points (active-links / nested-switch navMsTask@N) are N-summed
  // and clean in principle, but sit closer to the driver floor than the per-nav keys —
  // keep them on the validated-green noisy bound rather than the stable one. (The
  // scriptMs@N diag keys live only in the single-nav sweeps → caught above; cold-start's
  // scriptDurationMs@10 / jsHeapMB@10 and link-build's mountMs@N fall through to stable.)
  if (/^(navMsWall|navMsTask)@\d+$/.test(key)) return "noisy";
  return "stable";
}
