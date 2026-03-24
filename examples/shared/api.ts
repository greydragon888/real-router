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

function delay<T>(data: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), DELAY));
}

export const api = {
  getUsers: () => delay(users),
  getUser: (id: string) => delay(users.find((u) => u.id === id)),
  getProducts: () => delay(products),
  getProduct: (id: string) => delay(products.find((p) => p.id === id)),
  checkCartNotEmpty: () => delay(Math.random() > 0.5),
  checkPermission: (_userId: string) => delay(true),
  login: (email: string, _password: string) => {
    const user = users.find((u) => u.email === email);
    return delay(user ?? null);
  },
};
