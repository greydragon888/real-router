export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
}

const products = new Map<string, Product>([
  [
    "1",
    {
      id: "1",
      name: "Mechanical Keyboard",
      description: "Premium tactile switches, RGB, hot-swappable.",
      price: 159.99,
    },
  ],
  [
    "2",
    {
      id: "2",
      name: "Ergonomic Mouse",
      description: "Vertical grip, 6 programmable buttons, wireless.",
      price: 89.5,
    },
  ],
  [
    "3",
    {
      id: "3",
      name: "4K Monitor",
      description: '27" IPS panel, 144Hz, USB-C.',
      price: 549,
    },
  ],
]);

export function getProduct(id: string): Product | undefined {
  return products.get(id);
}

export function listProducts(): Product[] {
  return [...products.values()];
}
