import type { RscActionResult } from "@real-router/rsc-server-plugin";
import type { ReactElement } from "react";

interface Props {
  readonly action: RscActionResult | undefined;
}

// Server Component that reads the latest Server Action result from
// router state (state.context.rscAction). Renders a status banner
// for both successful and failed mutations; renders nothing for
// plain GET requests where no action ran.
//
// Demonstrates A2's value: the action result published by
// `rscActionPluginFactory` is reachable from any Server Component
// in the render tree without prop-drilling from the form component.
// EditEmailForm (the Client Component owning the form) still uses
// `useActionState` for its per-form message — that's local UX.
// The banner is the cross-cutting global feedback layer.
//
// rscAction is request-scoped — set ONLY on the response that
// processed the action. A subsequent GET (e.g. <Link> to another
// page) carries no action, so banner stays hidden.
//
// Two layers of "ok":
//   - `returnValue.ok` — outer envelope: did the action invocation
//     complete without throwing? (entry.rsc.tsx wraps the call in
//     try/catch and sets ok=false only on throw)
//   - `returnValue.data.ok` — inner business-logic result from the
//     action itself (e.g. validation succeeded vs. rejected). Our
//     `updateUserEmail` action returns `{ ok, message }`.
// We check `data.ok` because validation failures are not throws.
export function NotificationBanner({ action }: Props): ReactElement | null {
  const returnValue = action?.returnValue;

  if (!returnValue) {
    return null;
  }

  // Action threw → outer ok=false → render server-error.
  if (!returnValue.ok) {
    return (
      <div role="alert" data-testid="notification-banner-error">
        ✗ Action failed (server error)
      </div>
    );
  }

  // Action returned a typed business result. Inspect it.
  const data = returnValue.data as
    | { ok?: unknown; message?: unknown }
    | null
    | undefined;

  if (data && typeof data === "object" && data.ok === false) {
    const message =
      typeof data.message === "string" ? data.message : "Action failed";

    return (
      <div role="alert" data-testid="notification-banner-error">
        ✗ {message}
      </div>
    );
  }

  const message =
    data && typeof data === "object" && typeof data.message === "string"
      ? data.message
      : "Saved";

  return (
    <div role="status" data-testid="notification-banner-success">
      ✓ {message}
    </div>
  );
}
