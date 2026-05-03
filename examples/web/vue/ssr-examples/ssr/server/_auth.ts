import {
  lookupUserFromCookies,
  parseCookieHeader,
  type CurrentUser,
} from "../src/_known-users";

export function getCurrentUserFromCookies(
  cookieHeader: string | undefined,
): CurrentUser | null {
  return lookupUserFromCookies(parseCookieHeader(cookieHeader));
}
