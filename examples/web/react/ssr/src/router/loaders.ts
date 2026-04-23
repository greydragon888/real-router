import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

export const loaders: DataLoaderFactoryMap = {
  "users.list": () => () =>
    Promise.resolve({
      users: [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
        { id: "3", name: "Charlie" },
      ],
    }),
  "users.profile": () => (params) => {
    const id = params.id as string;

    return Promise.resolve({
      user: { id, name: `User ${id}` },
    });
  },
};
