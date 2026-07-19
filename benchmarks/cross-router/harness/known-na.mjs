// Documented competitor limitations — (cohort → scenario → [engines]) cells that CANNOT
// produce a COMPARABLE result: either the competing router errors, or it structurally
// cannot express the scenario's semantics (see the app-side comments). ONE registry
// shared by every results/ writer (run-all matrix, run.mjs single cell, run-subset) and
// by deck-extract's completeness count — before audit 07-18 K14 only run-all enforced
// it, so a single manual `run.mjs nested-switch mateo-router svelte …` could feed a
// documented-incomparable cell straight into the deck's SWEEP. Remove an entry if the
// competitor changes.
export const KNOWN_NA = {
  solid: { "deep-config": ["tanstack"] },
  svelte: { "nested-switch": ["mateo-router"] },
};

export const isKnownNA = (framework, scenario, engine) =>
  KNOWN_NA[framework]?.[scenario]?.includes(engine) ?? false;
