export interface User {
  id: string;
  name: string;
}

const USERS: readonly User[] = [
  { id: "1", name: "Alice" },
  { id: "2", name: "Bob" },
  { id: "3", name: "Charlie" },
];

export const database = {
  users: {
    list(): readonly User[] {
      return USERS;
    },
    findById(id: string): User | undefined {
      return USERS.find((user) => user.id === id);
    },
    allIds(): readonly string[] {
      return USERS.map((user) => user.id);
    },
  },
};
