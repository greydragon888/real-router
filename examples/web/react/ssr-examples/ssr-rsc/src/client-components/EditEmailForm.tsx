"use client";

import { useActionState, type JSX } from "react";
import { useFormStatus } from "react-dom";

import { updateUserEmail } from "../server-actions/updateUserEmail";

interface Props {
  userId: string;
  initialEmail: string;
}

// `useFormStatus` reads the pending state of the parent <form>. Lives
// in a separate child component because the hook only sees the form
// from its descendants — siblings of the trigger don't get pending
// state. Standard React 19 idiom.
function SubmitButton(): JSX.Element {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid="submit-email"
      data-pending={pending ? "true" : "false"}
      disabled={pending}
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

// Client Component (boundary marked by 'use client') that wraps the
// Server Action. React 19's `useActionState` binds the action,
// tracks last result, and exposes `formAction` for the <form>.
//
// Pattern:
//   - Without JS: <form action={action}> posts FormData to the
//     server. entry.rsc.tsx decodes the action via `decodeAction()`,
//     runs it, returns Flight payload that re-renders the page.
//     Progressive enhancement — works before hydration.
//   - With JS: useActionState intercepts submit; the action is
//     called via the RSC `setServerCallback` path with a serialized
//     reply; pending state available via useFormStatus; result
//     returned as the second element of the tuple.
export function EditEmailForm({ userId, initialEmail }: Props): JSX.Element {
  const [state, formAction] = useActionState(updateUserEmail, null);

  return (
    <form action={formAction} data-testid="edit-email-form">
      <input type="hidden" name="id" value={userId} />
      <label>
        Email:
        <input
          type="text"
          name="email"
          defaultValue={initialEmail}
          data-testid="email-input"
        />
      </label>
      <SubmitButton />
      {state ? (
        <p data-testid="action-result" data-ok={state.ok ? "true" : "false"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
