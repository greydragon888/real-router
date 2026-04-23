import { useNavigator, useRoute } from "@real-router/react";
import { useState } from "react";

import { ReturnToLastButton } from "../components/ReturnToLastButton";

import type { JSX } from "react";

export function ProductEdit(): JSX.Element {
  const { route } = useRoute<{ id: string }>();
  const navigator = useNavigator();
  const id = route?.params.id ?? "";

  const draftKey = `draft:product:${id}`;
  const [notes, setNotes] = useState<string>(
    () => sessionStorage.getItem(draftKey) ?? "",
  );

  return (
    <section>
      <ReturnToLastButton />
      <h1>Edit Product #{id}</h1>
      <p>
        Changes here are volatile. If you press browser back without saving, a
        confirmation dialog will appear. Clicking "Save" or navigating via a{" "}
        <code>Link</code> passes through without asking.
      </p>

      <label style={{ display: "block", marginTop: "16px" }}>
        <div style={{ marginBottom: "4px", fontWeight: 600 }}>
          Product notes
        </div>
        <textarea
          aria-label="Product notes"
          value={notes}
          onChange={(evt) => {
            const value = evt.target.value;
            setNotes(value);
            if (value) {
              sessionStorage.setItem(draftKey, value);
            } else {
              sessionStorage.removeItem(draftKey);
            }
          }}
          rows={6}
          style={{ width: "100%", fontFamily: "inherit", padding: "8px" }}
        />
      </label>

      <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem(draftKey);
            void navigator.navigate("products.product", { id });
          }}
        >
          Save
        </button>
      </div>
    </section>
  );
}
