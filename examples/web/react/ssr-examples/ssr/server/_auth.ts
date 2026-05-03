interface CurrentUser {
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "user";
}

// In a real app this lookup would hit a session store / JWT decode.
// Here we hardcode a tiny user map keyed by `userId` cookie.
const KNOWN_USERS: Record<string, CurrentUser> = {
  "1": { id: "1", name: "Alice", role: "admin" },
  "2": { id: "2", name: "Bob", role: "user" },
};

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(";")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf("=");
        if (idx === -1) return [pair, ""] as const;
        return [pair.slice(0, idx), pair.slice(idx + 1)] as const;
      }),
  );
}

export function getCurrentUserFromCookies(
  cookieHeader: string | undefined,
): CurrentUser | null {
  const cookies = parseCookies(cookieHeader);

  // New-style cookie: userId=1
  const userId = cookies["userId"];
  if (userId && KNOWN_USERS[userId]) {
    return KNOWN_USERS[userId];
  }

  // Backwards-compat with legacy auth=1 cookie used in earlier e2e tests:
  // treat as Alice (admin) so existing scenarios keep passing.
  if (cookies["auth"] === "1") {
    return KNOWN_USERS["1"] ?? null;
  }

  return null;
}
