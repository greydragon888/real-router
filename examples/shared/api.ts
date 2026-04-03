const DELAY = 300;

export interface User {
  id: string;
  name: string;
  role: "admin" | "editor" | "viewer";
  email: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
}

const users: User[] = [
  { id: "1", name: "Alice", role: "admin", email: "alice@example.com" },
  { id: "2", name: "Bob", role: "editor", email: "bob@example.com" },
  { id: "3", name: "Carol", role: "viewer", email: "carol@example.com" },
];

const products: Product[] = [
  {
    id: "1",
    name: "Laptop",
    price: 999,
    description: "High-performance laptop",
  },
  { id: "2", name: "Keyboard", price: 79, description: "Mechanical keyboard" },
  { id: "3", name: "Monitor", price: 449, description: '27" 4K display' },
];

function delay<T>(data: T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const timer = setTimeout(() => {
      resolve(data);
    }, DELAY);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export const api = {
  getUsers: (signal?: AbortSignal) => delay(users, signal),
  getUser: (id: string, signal?: AbortSignal) =>
    delay(
      users.find((u) => u.id === id),
      signal,
    ),
  getProducts: (signal?: AbortSignal) => delay(products, signal),
  getProduct: (id: string, signal?: AbortSignal) =>
    delay(
      products.find((p) => p.id === id),
      signal,
    ),
  checkCartNotEmpty: (signal?: AbortSignal) =>
    delay(Math.random() > 0.5, signal),
  checkPermission: (_userId: string, signal?: AbortSignal) =>
    delay(true, signal),
  login: (email: string, _password: string, signal?: AbortSignal) => {
    const user = users.find((u) => u.email === email);

    return delay(user ?? null, signal);
  },
};
