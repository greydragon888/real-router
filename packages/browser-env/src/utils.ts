/**
 * Normalizes base path: ensures leading slash, removes trailing slash.
 *
 * @example
 * normalizeBase("app")   // "/app"
 * normalizeBase("/app/") // "/app"
 * normalizeBase("")      // ""
 */
export function normalizeBase(base: string): string {
  if (!base) {
    return base;
  }

  let result = base;

  if (!result.startsWith("/")) {
    result = `/${result}`;
  }

  if (result.endsWith("/")) {
    result = result.slice(0, -1);
  }

  return result;
}

export const safelyEncodePath = (path: string): string => {
  try {
    return encodeURI(decodeURI(path));
  } catch (error) {
    console.warn(`[browser-env] Could not encode path "${path}"`, error);

    return path;
  }
};
