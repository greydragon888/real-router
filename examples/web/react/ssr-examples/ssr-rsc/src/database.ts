export interface User {
  id: string;
  name: string;
  email: string;
}

const userStore = new Map<string, User>([
  ["1", { id: "1", name: "Alice Anderson", email: "alice@example.com" }],
  ["2", { id: "2", name: "Bob Brown", email: "bob@example.com" }],
  ["42", { id: "42", name: "Jane Doe", email: "jane@example.com" }],
]);

export const database = {
  users: {
    findById: (id: string): Promise<User> =>
      Promise.resolve(
        userStore.get(id) ?? { id, name: `User ${id}`, email: `${id}@x.test` },
      ),
    list: (): Promise<User[]> => Promise.resolve([...userStore.values()]),
    setEmail: (id: string, email: string): void => {
      const existing = userStore.get(id);

      userStore.set(
        id,
        existing ? { ...existing, email } : { id, name: `User ${id}`, email },
      );
    },
  },
};

export type Database = typeof database;
