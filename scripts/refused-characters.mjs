// refused-characters.mjs — the characters the readers here refuse in a file
// they read: workflow YAML, by lines or through the `yaml` parser, and the
// generated regions of `sync-config.mjs`.
//
// The line readers split at LF, and the `yaml` parser breaks a line at LF or
// CRLF only. A character some YAML readers take for a line break and others
// do not — a lone CR, NEL, LS, PS; GitHub's scanner and actionlint take them
// so — makes one such line two for those readers, so a key hidden in a comment
// behind it would go unread here.

/**
 * A lone CR, NEL, LS or PS, and the other control characters, a tab included.
 * A file with any of them is refused: a refusal is cheaper than choosing whose
 * reading is right.
 */
export const REFUSED_CHARACTERS =
  /\r(?!\n)|[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029]/;
