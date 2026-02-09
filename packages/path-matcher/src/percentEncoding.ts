function isHexChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // '0'-'9'
    (code >= 65 && code <= 70) || // 'A'-'F'
    (code >= 97 && code <= 102) // 'a'-'f'
  );
}

export function validatePercentEncoding(value: string): boolean {
  let i = 0;

  while (i < value.length) {
    if (value[i] === "%") {
      if (i + 2 >= value.length) {
        return false;
      }

      /* v8 ignore start -- @preserve: codePointAt cannot return undefined due to bounds check above */
      const hex1 = value.codePointAt(i + 1) ?? 0;
      const hex2 = value.codePointAt(i + 2) ?? 0;
      /* v8 ignore stop */

      if (!isHexChar(hex1) || !isHexChar(hex2)) {
        return false;
      }

      i += 3;
    } else {
      i++;
    }
  }

  return true;
}
