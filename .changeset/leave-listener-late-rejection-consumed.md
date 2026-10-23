---
"@real-router/core": patch
---

Consume a leave listener's promise when an earlier listener cancelled the navigation (#2797)

Every `subscribeLeave` listener runs, and the later ones run with `signal.aborted === true` once an earlier one has cancelled the navigation — by aborting the caller's `opts.signal` or by calling `router.stop()`. A later listener whose promise rejected afterwards surfaced as an unhandled rejection, which ends a Node process under the default `--unhandled-rejections=throw`.

- The listeners' promises are consumed on that arc too, so the late rejection no longer escapes.
- `navigate()` settles as before: `TRANSITION_CANCELLED` after the cancel, and the listener's own error when nothing cancelled the navigation.
