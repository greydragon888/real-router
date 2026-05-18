export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}

const userStore = new Map<string, User>([
  [
    "1",
    {
      id: "1",
      name: "Alice Anderson",
      email: "alice@example.com",
      role: "admin",
    },
  ],
  ["2", { id: "2", name: "Bob Brown", email: "bob@example.com", role: "user" }],
  [
    "42",
    { id: "42", name: "Jane Doe", email: "jane@example.com", role: "user" },
  ],
]);

// IDs that are explicitly treated as "not found" — used by
// e2e tests to verify the typed-LoaderNotFound → 404 contract.
// Other unknown ids are fabricated on demand (see findById fallback)
// so per-request isolation tests can request /users/0…9 in parallel
// without seeding the store.
const EXPLICIT_MISSING_IDS = new Set(["9999"]);

export const database = {
  users: {
    findById: (id: string): Promise<User | undefined> => {
      if (EXPLICIT_MISSING_IDS.has(id)) {
        return Promise.resolve(undefined);
      }

      return Promise.resolve(
        userStore.get(id) ?? {
          id,
          name: `User ${id}`,
          email: `${id}@x.test`,
          role: "user",
        },
      );
    },
    list: (filter?: { role?: "admin" | "user" }): Promise<User[]> => {
      const all = [...userStore.values()];

      if (!filter?.role) {
        return Promise.resolve(all);
      }

      return Promise.resolve(all.filter((u) => u.role === filter.role));
    },
    setEmail: (id: string, email: string): void => {
      const existing = userStore.get(id);

      userStore.set(
        id,
        existing
          ? { ...existing, email }
          : { id, name: `User ${id}`, email, role: "user" },
      );
    },
  },
};

export type Database = typeof database;
