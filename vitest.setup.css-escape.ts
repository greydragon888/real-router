/* eslint-disable -- Vendored CSS.escape polyfill (verbatim spec reference); not application code. */
/**
 * `CSS.escape` polyfill for the test environment.
 *
 * jsdom (the vitest `environment: "jsdom"` runtime, jsdom@29) exposes **no**
 * global `CSS` object — neither `globalThis.CSS` nor `window.CSS`. Source code
 * that calls `CSS.escape(...)` (as required by `unicorn/require-css-escape`,
 * e.g. `shared/dom-utils/route-announcer.ts`) therefore throws
 * `Cannot read properties of undefined (reading 'escape')` under tests, even
 * though it works in every real browser.
 *
 * This setup file (wired via `vitest.config.common.mts#test.setupFiles`)
 * installs a spec-correct `CSS.escape` only when one is missing — a no-op in
 * any environment that already provides it.
 *
 * Implementation: the CSSOM reference algorithm
 * (https://drafts.csswg.org/cssom/#the-css.escape()-method), as published by
 * Mathias Bynens' `CSS.escape` polyfill (MIT).
 */
function cssEscape(value: string): string {
  const string = String(value);
  const length = string.length;
  let index = -1;
  let codeUnit: number;
  let result = "";
  const firstCodeUnit = string.charCodeAt(0);

  if (length === 1 && firstCodeUnit === 0x002d) {
    // "-" alone
    return "\\" + string;
  }

  while (++index < length) {
    codeUnit = string.charCodeAt(index);

    // NULL -> REPLACEMENT CHARACTER (U+FFFD)
    if (codeUnit === 0x0000) {
      result += "�";
      continue;
    }

    if (
      // [\1-\1f\7f]
      (codeUnit >= 0x0001 && codeUnit <= 0x001f) ||
      codeUnit === 0x007f ||
      // leading digit
      (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      // leading "-" followed by digit
      (index === 1 &&
        codeUnit >= 0x0030 &&
        codeUnit <= 0x0039 &&
        firstCodeUnit === 0x002d)
    ) {
      result += "\\" + codeUnit.toString(16) + " ";
      continue;
    }

    if (
      codeUnit >= 0x0080 ||
      codeUnit === 0x002d ||
      codeUnit === 0x005f ||
      (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
      (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
      (codeUnit >= 0x0061 && codeUnit <= 0x007a)
    ) {
      result += string.charAt(index);
      continue;
    }

    result += "\\" + string.charAt(index);
  }

  return result;
}

const g = globalThis as { CSS?: { escape?: (value: string) => string } };

g.CSS ??= {};
g.CSS.escape ??= cssEscape;
