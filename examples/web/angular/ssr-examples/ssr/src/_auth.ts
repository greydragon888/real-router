import {
  lookupUserFromCookies,
  parseCookieHeader,
  type CurrentUser,
} from "./_known-users";

export function getCurrentUserFromRequest(
  request: Request | null,
): CurrentUser | null {
  if (request) {
    return lookupUserFromCookies(
      parseCookieHeader(request.headers.get("cookie") ?? undefined),
    );
  }

  if (typeof document !== "undefined") {
    return lookupUserFromCookies(parseCookieHeader(document.cookie));
  }

  return null;
}
