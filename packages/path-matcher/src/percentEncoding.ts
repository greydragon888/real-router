function isHexCodePoint(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x46) ||
    (code >= 0x61 && code <= 0x66)
  );
}

export function validatePercentEncoding(value: string): boolean {
  let i = 0;

  while (i < value.length) {
    if (value.codePointAt(i) === 0x25 /* % */) {
      // Stryker disable next-line ArithmeticOperator,BlockStatement: equivalent — a truncated "%" is independently rejected downstream by the `?? 0` fallback (codePointAt past end -> 0, never a hex code point), so weakening (`i - 2`) or emptying this early-exit changes no observable result. Proven: removing the whole block keeps the full unit+property+stress suite green. The ConditionalExpression/EqualityOperator variants here stay live (they have killable siblings).
      if (i + 2 >= value.length) {
        return false;
      }

      /* v8 ignore start -- @preserve: codePointAt cannot return undefined due to bounds check above */
      const hex1 = value.codePointAt(i + 1) ?? 0;
      const hex2 = value.codePointAt(i + 2) ?? 0;
      /* v8 ignore stop */

      if (!isHexCodePoint(hex1) || !isHexCodePoint(hex2)) {
        return false;
      }

      i += 3;
    } else {
      i++;
    }
  }

  return true;
}
