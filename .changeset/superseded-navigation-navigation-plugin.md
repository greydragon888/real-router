---
"@real-router/navigation-plugin": minor
---

A browser navigation that a newer router navigation cancels waits for that navigation's end (#2802)

While a guard held a Back, a Forward or a link the browser started, a router navigation that superseded it was taken to own the URL at the cancel. When that navigation was refused afterwards, the browser stayed on the entry the cancelled navigation reached while the router stayed where it was.

- The intercept now stays pending until the router navigations announced meanwhile have ended. One that commits owns the URL. One that is refused, or cancelled with nothing newer behind it, sends the browser back to the entry the router stands on, as a refusal does (#2740, #2796). A `navigate()` that a `TRANSITION_CANCEL` listener registered before the browser's navigation began starts in a microtask after a guard cancels that navigation quietly is waited for the same way: when a guard refuses it at once, a redirect a listener of that refusal starts in a microtask owns the URL, where the browser was sent back first.
- The plugin's watch over newer navigations takes a `TRANSITION_SUCCESS` listener for each browser navigation it takes as well. A router whose `limits.maxListeners` (10,000 by default) leaves no room on start, success, error or cancel refuses the watch, and the URL is then left to the other navigations at the cancel, a guard's quiet cancel included — as when the limit refused the watch before.

**Breaking Change:** `finished` of the cancelled navigation follows that end, where it resolved at the cancel. The plugin's write of a commit to another URL aborts it: `navigateerror` fires with `AbortError`, `finished` rejects, and the browser skips the scroll it applies when a navigation finishes — the page a link or `navigation.navigate()` was superseded on keeps the offset it had, where it was scrolled to the top. A commit to the URL it reached only updates that entry's state, and `finished` resolves. A return rejects it with the router's `RouterError` (`TRANSITION_CANCELLED`). Measured on Chromium 153, Firefox 155 and WebKit 26.6.

**Migration:** a `navigateerror` listener, or code awaiting `finished`, that reports every rejection as a failure skips the two a newer navigation causes.

```diff
 navigation.addEventListener("navigateerror", (event) => {
+  if (
+    event.error?.name === "AbortError" ||
+    event.error?.code === errorCodes.TRANSITION_CANCELLED
+  ) {
+    return;
+  }
+
   reportFailure(event.error);
 });
```
