export function safeParseUrl(url: string, loggerContext: string): URL | null {
  try {
    const parsedUrl = new URL(url, globalThis.location.origin);

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      console.warn(`[${loggerContext}] Invalid URL protocol in ${url}`);

      return null;
    }

    return parsedUrl;
  } catch (error) {
    console.warn(`[${loggerContext}] Could not parse url ${url}`, error);

    return null;
  }
}
