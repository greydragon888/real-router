export interface CurrentUser {
  id: string;
  name: string;
  role: "admin" | "user";
}

export const KNOWN_USERS: Partial<Record<string, CurrentUser>> = {
  "1": { id: "1", name: "Alice", role: "admin" },
  "2": { id: "2", name: "Bob", role: "user" },
};

export function parseCookieHeader(
  header: string | undefined,
): Record<string, string> {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header
      .split(";")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf("=");

        if (idx === -1) {
          return [pair, ""] as const;
        }

        return [pair.slice(0, idx), pair.slice(idx + 1)] as const;
      }),
  );
}

export function lookupUserFromCookies(
  cookies: Record<string, string>,
): CurrentUser | null {
  const userId = cookies.userId;
  const user = userId ? KNOWN_USERS[userId] : undefined;

  if (user) {
    return user;
  }

  if (cookies.auth === "1") {
    return KNOWN_USERS["1"] ?? null;
  }

  return null;
}
