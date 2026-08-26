// The predicate behind `lint:coverage-scope`'s "does this shared dir have a
// measuring owner?" check, split out so it can be unit-tested without running
// the CLI script's top-level body (#1838).
//
// ⚠ It exists as a separate module for a reason worth keeping: the check it
// replaces was `configText.includes("**/shared/<dir>/")` over the WHOLE file,
// comments included — and every owner config spells that exact glob in prose,
// deliberately, because a comment there explains that the literal form is
// grepped by this very script. So the guard was reading the sentence that
// describes the include rather than the include. Measured on `browser-plugin`:
// deleting the real `coverage.include` entry and keeping the comment left
// `lint:coverage-scope` at exit 0 while the package's own coverage run went from
// 16 files to 2 with zero `shared/*` rows.

/**
 * Removes line and block comments, string contents left intact.
 *
 * Hand-rolled rather than regex'd because the whole point is to stop matching
 * prose: a regex that ignores string/comment context is the same class of
 * mistake one level down. Template literals are treated as strings; that is
 * enough for a vitest config and the parser errs toward KEEPING text, so a
 * shape it does not understand fails the check rather than passing it.
 */
export function stripComments(source) {
  let out = "";
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/"))
        i += 1;
      i += 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;

      out += ch;
      i += 1;

      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }

        out += source[i];
        i += 1;
      }

      out += quote;
      i += 1;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * The string literals of a `coverage.<prop>` array, or `[]` when the config
 * declares none.
 */
export function coverageArrayEntries(configText, prop) {
  const code = stripComments(configText);
  const at = code.indexOf(`coverage.${prop}`);

  if (at === -1) {
    return [];
  }

  const open = code.indexOf("[", at);
  const close = code.indexOf("]", open);

  if (open === -1 || close === -1) {
    return [];
  }

  return arrayElementLiterals(code.slice(open + 1, close));
}

/**
 * The string literals that are ELEMENTS of an array body, ignoring any nested
 * inside a call.
 *
 * ⚠ Not cosmetic. The owner configs spell their exclusion as
 * `[...base.filter((p) => p !== "**\/index.ts"), "packages/**\/index.ts"]`, so a
 * flat literal-scan reports the filtered-OUT pattern as if it were still an
 * entry — measured, it returned both and made a guard assert the opposite of
 * the truth.
 */
function arrayElementLiterals(body) {
  let depth = 0;
  let flat = "";

  for (const ch of body) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (depth === 0) flat += ch;
  }

  return [...flat.matchAll(/["'`]([^"'`]*)["'`]/g)].map((m) => m[1]);
}

/**
 * Whether this config measures `shared/<dir>`: `allowExternal` set in CODE, and
 * an actual `coverage.include` ENTRY naming the dir.
 */
/** Back-compat alias: the include array is the one the owner check reads. */
export function coverageIncludeEntries(configText) {
  return coverageArrayEntries(configText, "include");
}

export function declaresSharedOwner(configText, dir) {
  const code = stripComments(configText);

  if (!code.includes("allowExternal")) {
    return false;
  }

  return coverageIncludeEntries(configText).some((entry) =>
    entry.includes(`shared/${dir}/`),
  );
}
