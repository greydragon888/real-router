export const entries: Record<string, () => Promise<Record<string, string>[]>> =
  {
    "users.profile": async () => [{ id: "1" }, { id: "2" }, { id: "3" }],
  };
