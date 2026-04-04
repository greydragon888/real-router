export function defaultParseQueryString(
  queryString: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (queryString.length === 0) {
    return params;
  }

  // M5: Manual scan avoids split("&") array allocation
  let start = 0;
  const length = queryString.length;

  while (start <= length) {
    let ampIdx = queryString.indexOf("&", start);

    if (ampIdx === -1) {
      ampIdx = length;
    }

    const eqIdx = queryString.indexOf("=", start);

    if (eqIdx === -1 || eqIdx > ampIdx) {
      params[decodeURIComponent(queryString.slice(start, ampIdx))] = "";
    } else {
      params[decodeURIComponent(queryString.slice(start, eqIdx))] =
        decodeURIComponent(queryString.slice(eqIdx + 1, ampIdx));
    }

    start = ampIdx + 1;
  }

  return params;
}

export function defaultBuildQueryString(
  params: Record<string, unknown>,
): string {
  let result = "";

  for (const key in params) {
    if (result.length > 0) {
      result += "&";
    }

    const value = params[key];
    const encodedKey = encodeURIComponent(key);

    result +=
      value === ""
        ? encodedKey
        : `${encodedKey}=${encodeURIComponent(String(value))}`;
  }

  return result;
}
