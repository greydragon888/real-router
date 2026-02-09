export function defaultParseQueryString(
  queryString: string,
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  if (queryString.length === 0) {
    return params;
  }

  const pairs = queryString.split("&");

  for (const pair of pairs) {
    const eqIdx = pair.indexOf("=");

    if (eqIdx === -1) {
      params[pair] = "";
    } else {
      params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
    }
  }

  return params;
}

export function defaultBuildQueryString(
  params: Record<string, unknown>,
): string {
  const parts: string[] = [];

  for (const key of Object.keys(params)) {
    const value = params[key];
    const encodedKey = encodeURIComponent(key);

    parts.push(
      value === ""
        ? encodedKey
        : `${encodedKey}=${encodeURIComponent(String(value))}`,
    );
  }

  return parts.join("&");
}
