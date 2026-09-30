// lint-tasks.mjs — the turbo tasks that run ESLint, and the role of each.
//
// One table, read two ways: `lint-reach.mjs` counts every key — each task that
// lints a package gates it; `benchmarks-lint-filter.mjs` plans the
// `benchmarks-lint` job from the keys whose role is "outside-pipeline". A single
// set shared by both would plan that job on every PR that touches a package.
//
// ⚠ Not under `scripts/lib/`: that directory is an input of every package's
// tasks in turbo.json, and an edit to this table would re-key them all.

/**
 * - "pipeline": CI's turbo pipeline runs it for the packages a PR affects.
 * - "outside-pipeline": no pipeline job runs it; a job of its own does.
 *
 * @type {Record<string, "pipeline" | "outside-pipeline">}
 */
export const LINT_TASK_ROLES = {
  lint: "pipeline",
  "lint:bench": "outside-pipeline",
};
