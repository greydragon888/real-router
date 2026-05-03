export interface User {
  id: string;
  name: string;
  role: "admin" | "user";
}

export interface Post {
  id: string;
  authorId: string;
  title: string;
}

const USERS: readonly User[] = [
  { id: "1", name: "Alice", role: "admin" },
  { id: "2", name: "Bob", role: "user" },
  { id: "3", name: "Charlie", role: "user" },
];

const POSTS: readonly Post[] = [
  { id: "p1", authorId: "1", title: "Hello world" },
  { id: "p2", authorId: "1", title: "On routing" },
  { id: "p3", authorId: "2", title: "SSR notes" },
];

export const database = {
  users: {
    list(sort: "asc" | "desc" = "asc"): readonly User[] {
      return USERS.toSorted((left, right) =>
        sort === "asc"
          ? left.name.localeCompare(right.name)
          : right.name.localeCompare(left.name),
      );
    },
    findById(id: string): User | undefined {
      return USERS.find((user) => user.id === id);
    },
  },
  posts: {
    listByAuthor(authorId: string): readonly Post[] {
      return POSTS.filter((p) => p.authorId === authorId);
    },
  },
};
