"use server";

import { database } from "../database";

// React 19 Server Action — declared with the `'use server'` directive
// at the top of the module. The bundler (`@vitejs/plugin-rsc`) marks
// every export as a server reference; from the client side, calling
// the function actually triggers an HTTP POST to the server with
// FormData (or encoded args), which the entry.rsc.tsx handler decodes
// via `decodeAction`/`decodeReply` + `loadServerAction`.
//
// The function runs ONLY on the server. It can read environment
// secrets, mutate the database, etc., without exposing any of that
// to the client bundle. The return value is serialized through Flight
// back to the caller.
export async function updateUserEmail(
  _prevState: { ok: boolean; message: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const id = formData.get("id");
  const email = formData.get("email");

  if (typeof id !== "string" || typeof email !== "string") {
    return { ok: false, message: "Invalid form data" };
  }

  // Trivial validation — real apps would do more (zod, etc.).
  if (!email.includes("@")) {
    return { ok: false, message: "Invalid email format" };
  }

  database.users.setEmail(id, email);

  return { ok: true, message: `Email updated to ${email}` };
}
