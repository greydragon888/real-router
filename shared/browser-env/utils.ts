/**
 * Normalizes base path to canonical form: leading slash, no trailing slash,
 * no repeated slashes. Isolated "/" collapses to "".
 *
 * @example
 * normalizeBase("app")     // "/app"
 * normalizeBase("/app/")   // "/app"
 * normalizeBase("//app//") // "/app"
 * normalizeBase("")        // ""
 * normalizeBase("/")       // ""
 */
export function normalizeBase(base: string): string {
  if (!base) {
    return base;
  }

  let result = base.replaceAll(/\/+/g, "/");

  if (!result.startsWith("/")) {
    result = `/${result}`;
  }

  if (result.length > 1 && result.endsWith("/")) {
    result = result.slice(0, -1);
  }

  return result === "/" ? "" : result;
}

export const safelyEncodePath = (path: string): string => {
  try {
    return encodeURI(decodeURI(path));
  } catch (error) {
    console.warn(`[browser-env] Could not encode path "${path}"`, error);

    return path;
  }
};
