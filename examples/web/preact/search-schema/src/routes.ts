import { z } from "zod";

import type { Route } from "@real-router/core";

const productsSearchSchema = z.object({
  q: z.string().optional(),
  page: z.number().int().positive().default(1),
  sort: z.enum(["name", "price", "date"]).default("name"),
});

export const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "products",
    path: "/products?q&page&sort",
    defaultParams: { page: 1, sort: "name" },
    searchSchema: productsSearchSchema,
  },
];
