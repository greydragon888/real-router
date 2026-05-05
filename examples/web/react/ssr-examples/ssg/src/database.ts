export interface User {
  id: string;
  name: string;
}

export interface Post {
  id: string;
  authorId: string;
  title: string;
}

const USERS: readonly User[] = [
  { id: "1", name: "Alice" },
  { id: "2", name: "Bob" },
  { id: "3", name: "Charlie" },
];

const POSTS: readonly Post[] = [
  { id: "p1", authorId: "1", title: "Hello world" },
  { id: "p2", authorId: "1", title: "On routing" },
  { id: "p3", authorId: "2", title: "SSR notes" },
  // Charlie (id "3") has no posts — exercises the empty-state path.
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
  posts: {
    listByAuthor(authorId: string): readonly Post[] {
      return POSTS.filter((post) => post.authorId === authorId);
    },
  },
};
