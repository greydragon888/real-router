// refused-characters.mjs — what a line reader of workflow YAML refuses.
//
// `scripts/runner-labels.mjs` and the step readers of `scripts/ci-gate.mjs` read a
// workflow line by line, split at LF. A character some YAML readers take for a
// line break and others do not — a lone CR, NEL, LS, PS; actionlint takes them
// so — makes one such line two for those readers, so a key hidden in a comment
// behind it would go unread here.

/**
 * A lone CR, NEL, LS or PS, and the other control characters, a tab included.
 * A file with any of them is refused: a refusal is cheaper than choosing whose
 * reading is right.
 */
export const REFUSED_CHARACTERS =
  /\r(?!\n)|[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/;
