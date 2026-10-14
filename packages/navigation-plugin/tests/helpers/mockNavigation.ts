/* eslint-disable @typescript-eslint/member-ordering -- mock implementation; ordering doesn't matter */
/* eslint-disable @typescript-eslint/no-empty-function -- interface stubs */

let entryCounter = 0;
let idCounter = 0;

/** The promises of a navigation that left the document. */
const PENDING = new Promise<never>(() => {});

function generateKey(): string {
  return `key-${++entryCounter}`;
}

// Every entry gets an id of its own: a replace keeps the key of the entry it
// replaces and changes its id (measured on Chromium 153, Firefox 155 and
// WebKit 26.6, #2751).
function generateId(): string {
  return `id-${++idCounter}`;
}

function isSameOrigin(url: string, base: string): boolean {
  try {
    const parsed = new URL(url, base);
    const baseUrl = new URL(base);

    return parsed.origin === baseUrl.origin;
  } catch {
    return false;
  }
}

/**
 * Whether a push or replace to `newUrl` stays in the current document: the URLs
 * differ only in the fragment and `newUrl` has one. Anything else loads a new
 * document unless a listener intercepts it.
 */
function isFragmentNavigation(oldUrl: string, newUrl: string): boolean {
  try {
    const oldParsed = new URL(oldUrl);
    const newParsed = new URL(newUrl);

    return (
      oldParsed.origin === newParsed.origin &&
      oldParsed.pathname === newParsed.pathname &&
      oldParsed.search === newParsed.search &&
      newParsed.href.includes("#")
    );
  } catch {
    return false;
  }
}

function isHashChange(oldUrl: string, newUrl: string): boolean {
  try {
    const oldParsed = new URL(oldUrl);
    const newParsed = new URL(newUrl);

    return (
      oldParsed.origin === newParsed.origin &&
      oldParsed.pathname === newParsed.pathname &&
      oldParsed.search === newParsed.search &&
      oldParsed.hash !== newParsed.hash
    );
  } catch {
    return false;
  }
}

export class MockNavigationEntry implements NavigationHistoryEntry {
  readonly url: string;
  readonly key: string;
  readonly id: string;
  readonly sameDocument: boolean;

  private _index: number;
  private _state: unknown;

  constructor(
    url: string,
    options: { key?: string; state?: unknown; index: number },
  ) {
    this.url = url;
    this.key = options.key ?? generateKey();
    this.id = generateId();
    this.sameDocument = true;
    this._index = options.index;
    // A browser stores a structured clone of the state on write, and returns
    // a fresh one on every read (#2741).
    this._state = structuredClone(options.state);
  }

  get index(): number {
    return this._index;
  }

  getState(): unknown {
    return structuredClone(this._state);
  }

  _setState(state: unknown): void {
    this._state = structuredClone(state);
  }

  _setIndex(index: number): void {
    this._index = index;
  }

  ondispose: ((this: NavigationHistoryEntry, event: Event) => unknown) | null =
    null;
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return true;
  }
}

export class MockNavigateEvent extends Event implements NavigateEvent {
  readonly navigationType: NavigationType;
  readonly destination: NavigationDestination;
  readonly canIntercept: boolean;
  readonly userInitiated: boolean;
  readonly info: unknown;
  readonly signal: AbortSignal;
  readonly hashChange: boolean;
  readonly downloadRequest: string | null;
  readonly formData: FormData | null;
  readonly hasUAVisualTransition: boolean = false;
  readonly sourceElement: Element | null;

  private _interceptHandlers: NavigationInterceptHandler[] = [];
  private _precommitHandlers: NavigationPrecommitHandler[] = [];
  private _abortController: AbortController;
  private _manualScroll = false;
  private _scrolled = false;
  private readonly _precommitSupported: boolean;
  /** Records a scroll the browser applies for this navigation. */
  _onScroll: () => void = () => {};

  constructor(options: {
    navigationType: NavigationType;
    destination: NavigationDestination;
    canIntercept: boolean;
    userInitiated: boolean;
    info: unknown;
    hashChange: boolean;
    abortController: AbortController;
    sourceElement?: Element | null;
    downloadRequest?: string | null;
    formData?: FormData | null;
    cancelable?: boolean;
    precommitSupported?: boolean;
  }) {
    super("navigate", {
      cancelable: options.cancelable ?? true,
      bubbles: false,
    });
    this._precommitSupported = options.precommitSupported ?? true;
    this.navigationType = options.navigationType;
    this.destination = options.destination;
    this.canIntercept = options.canIntercept;
    this.userInitiated = options.userInitiated;
    this.info = options.info;
    this.hashChange = options.hashChange;
    this._abortController = options.abortController;
    this.signal = options.abortController.signal;
    this.sourceElement = options.sourceElement ?? null;
    this.downloadRequest = options.downloadRequest ?? null;
    this.formData = options.formData ?? null;
  }

  intercept(options?: NavigationInterceptOptions): void {
    // A browser without precommit handlers ignores the option; one with them
    // refuses it on a navigation that cannot be cancelled — a traversal
    // without a user activation (measured on Chromium 153, #2740).
    if (options?.precommitHandler && this._precommitSupported) {
      if (!this.cancelable) {
        throw new DOMException(
          "A navigation that cannot be cancelled takes no precommit handler",
          "InvalidStateError",
        );
      }

      this._precommitHandlers.push(options.precommitHandler);
    }

    if (options?.handler) {
      this._interceptHandlers.push(options.handler);
    }

    if (options?.scroll === "manual") {
      this._manualScroll = true;
    }
  }

  /**
   * The scroll the browser applies when a navigation finishes. It works on a
   * navigation another one has aborted, once per navigation (measured on
   * Chromium 153, Firefox 155 and WebKit 26.6, #2751).
   */
  scroll(): void {
    if (this._scrolled) {
      throw new DOMException(
        "The navigation has already scrolled",
        "InvalidStateError",
      );
    }

    this._scrolled = true;
    this._onScroll();
  }

  get _hasPrecommitHandlers(): boolean {
    return this._precommitHandlers.length > 0;
  }

  async _runPrecommitHandlers(
    controller: NavigationPrecommitController,
  ): Promise<void> {
    for (const handler of this._precommitHandlers) {
      await handler(controller);
    }
  }

  async _runHandlers(): Promise<void> {
    for (const handler of this._interceptHandlers) {
      await handler();
    }
  }

  /**
   * The browser's own scroll when the handlers finish. An aborted navigation
   * gets none, and neither does a `scroll: "manual"` one.
   */
  _finish(): void {
    if (!this.signal.aborted && !this._manualScroll && !this._scrolled) {
      this.scroll();
    }
  }

  get _wasIntercepted(): boolean {
    return this._interceptHandlers.length > 0;
  }

  _abort(): void {
    this._abortController.abort();
  }
}

/** What a precommit handler gets: `redirect()` sets the URL the navigation commits. */
export class MockNavigationPrecommitController implements NavigationPrecommitController {
  private readonly _event: MockNavigateEvent;
  private readonly _from: string;
  private readonly _onRedirect: (url: string) => void;

  constructor(
    event: MockNavigateEvent,
    from: string,
    onRedirect: (url: string) => void,
  ) {
    this._event = event;
    this._from = from;
    this._onRedirect = onRedirect;
  }

  addHandler(handler: NavigationInterceptHandler): void {
    this._event.intercept({ handler });
  }

  redirect(url: string | URL): void {
    const resolved = new URL(url, this._from).href;

    if (!isSameOrigin(resolved, this._from)) {
      throw new DOMException(
        "The document cannot have its URL rewritten to the redirect's",
        "SecurityError",
      );
    }

    this._onRedirect(resolved);
  }
}

interface NavigationResult {
  committed: Promise<MockNavigationEntry>;
  finished: Promise<MockNavigationEntry>;
}

interface NavigationParams {
  navigationType: NavigationType;
  destinationUrl: string;
  destinationState: unknown;
  destinationKey?: string;
  destinationId?: string;
  destinationIndex?: number;
  canIntercept: boolean;
  userInitiated: boolean;
  info: unknown;
  hashChange: boolean;
  sameDocument: boolean;
  downloadRequest?: string;
  formData?: FormData;
}

export class MockNavigation implements Navigation {
  private _entries: MockNavigationEntry[];
  private _currentIndex: number;
  private _listeners: Map<string, Set<(evt: NavigateEvent) => void>>;
  private _ongoingAbortController: AbortController | null = null;

  activation: NavigationActivation | null = null;
  transition: NavigationTransition | null = null;

  oncurrententrychange:
    | ((this: Navigation, event: NavigationCurrentEntryChangeEvent) => unknown)
    | null = null;
  onnavigate: ((this: Navigation, event: NavigateEvent) => unknown) | null =
    null;
  onnavigatesuccess: ((this: Navigation, event: Event) => unknown) | null =
    null;
  onnavigateerror: ((this: Navigation, event: ErrorEvent) => unknown) | null =
    null;

  constructor(initialUrl = "http://localhost/") {
    const entry = new MockNavigationEntry(initialUrl, { index: 0 });

    this._entries = [entry];
    this._currentIndex = 0;
    this._listeners = new Map();
  }

  get currentEntry(): MockNavigationEntry | null {
    return this._entries[this._currentIndex] ?? null;
  }

  entries(): MockNavigationEntry[] {
    return [...this._entries];
  }

  get canGoBack(): boolean {
    return this._currentIndex > 0;
  }

  get canGoForward(): boolean {
    return this._currentIndex < this._entries.length - 1;
  }

  navigate(url: string, options?: NavigationNavigateOptions): NavigationResult {
    const resolvedUrl = new URL(
      url,
      this.currentEntry?.url ?? "http://localhost/",
    ).href;
    const currentUrl = this.currentEntry?.url ?? "";
    const sameOrigin = isSameOrigin(resolvedUrl, currentUrl);
    const historyBehavior = options?.history ?? "auto";
    const state: unknown = options?.state;
    const info: unknown = options?.info;

    const isReplace =
      historyBehavior === "replace" ||
      (historyBehavior === "auto" && resolvedUrl === currentUrl);

    const navigationType: NavigationType = isReplace ? "replace" : "push";

    return this._performNavigation({
      navigationType,
      destinationUrl: resolvedUrl,
      destinationState: state,
      canIntercept: sameOrigin,
      userInitiated: false,
      info,
      hashChange: isHashChange(currentUrl, resolvedUrl),
      sameDocument: isFragmentNavigation(currentUrl, resolvedUrl),
    });
  }

  /**
   * `history.pushState()` by code outside the router: a same-document push the
   * browser commits whether or not a listener intercepts it.
   */
  historyPushState(url: string): NavigationResult {
    return this._historyNavigation("push", url);
  }

  /** `history.replaceState()` by code outside the router — see `historyPushState`. */
  historyReplaceState(url: string): NavigationResult {
    return this._historyNavigation("replace", url);
  }

  private _historyNavigation(
    navigationType: "push" | "replace",
    url: string,
  ): NavigationResult {
    const resolvedUrl = new URL(url, this.currentUrl).href;

    return this._performNavigation({
      navigationType,
      destinationUrl: resolvedUrl,
      destinationState: undefined,
      canIntercept: true,
      userInitiated: false,
      info: undefined,
      hashChange: isHashChange(this.currentUrl, resolvedUrl),
      sameDocument: true,
    });
  }

  /** A POST form submission to `url`. */
  submitForm(url: string, formData: FormData): NavigationResult {
    const resolvedUrl = new URL(url, this.currentUrl).href;

    return this._performNavigation({
      navigationType: "push",
      destinationUrl: resolvedUrl,
      destinationState: undefined,
      canIntercept: isSameOrigin(resolvedUrl, this.currentUrl),
      userInitiated: true,
      info: undefined,
      hashChange: false,
      sameDocument: false,
      formData,
    });
  }

  /**
   * A click on `<a href={url} download={filename}>`. Left to the browser, it
   * downloads and the document stays where it is.
   */
  download(url: string, filename = ""): void {
    const resolvedUrl = new URL(url, this.currentUrl).href;

    this._performNavigation({
      navigationType: "push",
      destinationUrl: resolvedUrl,
      destinationState: undefined,
      canIntercept: isSameOrigin(resolvedUrl, this.currentUrl),
      userInitiated: true,
      info: undefined,
      hashChange: false,
      sameDocument: false,
      downloadRequest: filename,
    });
  }

  traverseTo(key: string, options?: { info?: unknown }): NavigationResult {
    const targetIndex = this._entries.findIndex((entry) => entry.key === key);

    // An unknown key returns rejected promises, nobody's handled — it does not
    // throw (measured on Chromium 153).
    if (targetIndex === -1) {
      const error = new DOMException(
        `Entry with key "${key}" not found in entries list`,
        "InvalidStateError",
      );

      return {
        committed: Promise.reject(error),
        finished: Promise.reject(error),
      };
    }

    return this._performTraversal(targetIndex, false, options?.info);
  }

  back(): NavigationResult {
    if (this._currentIndex <= 0) {
      throw new DOMException("Cannot go back", "InvalidStateError");
    }

    return this._performTraversal(this._currentIndex - 1, true);
  }

  forward(): NavigationResult {
    if (this._currentIndex >= this._entries.length - 1) {
      throw new DOMException("Cannot go forward", "InvalidStateError");
    }

    return this._performTraversal(this._currentIndex + 1, true);
  }

  reload(): NavigationResult {
    const entry = this.currentEntry;

    if (!entry) {
      throw new DOMException("No current entry", "InvalidStateError");
    }

    return this._performNavigation({
      navigationType: "reload",
      destinationUrl: entry.url,
      destinationState: entry.getState(),
      canIntercept: true,
      userInitiated: false,
      info: undefined,
      hashChange: false,
      sameDocument: false,
    });
  }

  updateCurrentEntry(options: NavigationUpdateCurrentEntryOptions): void {
    const entry = this.currentEntry;

    if (entry) {
      entry._setState(options.state);
    }
  }

  addEventListener(
    type: string,
    fn: ((evt: NavigateEvent) => void) | EventListenerOrEventListenerObject,
  ): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }

    const handler = typeof fn === "function" ? fn : fn.handleEvent.bind(fn);
    const listeners = this._listeners.get(type);

    if (listeners) {
      listeners.add(handler);
    }
  }

  removeEventListener(
    type: string,
    fn: ((evt: NavigateEvent) => void) | EventListenerOrEventListenerObject,
  ): void {
    const handler = typeof fn === "function" ? fn : fn.handleEvent.bind(fn);

    this._listeners.get(type)?.delete(handler);
  }

  dispatchEvent(): boolean {
    return true;
  }

  get currentUrl(): string {
    return this.currentEntry?.url ?? "";
  }

  async goBack(): Promise<void> {
    if (this._currentIndex <= 0) {
      return;
    }

    const result = this._performTraversal(this._currentIndex - 1, true);

    await result.finished;
  }

  async goForward(): Promise<void> {
    if (this._currentIndex >= this._entries.length - 1) {
      return;
    }

    const result = this._performTraversal(this._currentIndex + 1, true);

    await result.finished;
  }

  reset(initialUrl = "http://localhost/"): void {
    entryCounter = 0;
    const entry = new MockNavigationEntry(initialUrl, { index: 0 });

    this._entries = [entry];
    this._currentIndex = 0;
    this._listeners.clear();
    this._ongoingAbortController = null;
    this._scrolls.length = 0;
    this._crossDocumentNavigations.length = 0;
    this._downloads.length = 0;
  }

  private _performTraversal(
    targetIndex: number,
    userInitiated: boolean,
    info?: unknown,
  ): NavigationResult {
    const target = this._entries[targetIndex];

    return this._performNavigation({
      navigationType: "traverse",
      destinationUrl: target.url,
      destinationState: target.getState(),
      destinationKey: target.key,
      destinationId: target.id,
      destinationIndex: target.index,
      canIntercept: true,
      userInitiated,
      info,
      hashChange: isHashChange(this.currentUrl, target.url),
      sameDocument: target.sameDocument,
    });
  }

  private _performNavigation(params: NavigationParams): NavigationResult {
    if (this._ongoingAbortController) {
      this._ongoingAbortController.abort();
      this._ongoingAbortController = null;
    }

    const abortController = new AbortController();

    this._ongoingAbortController = abortController;

    const isTraverse = params.navigationType === "traverse";
    const destination: NavigationDestination = {
      url: params.destinationUrl,
      key: isTraverse ? (params.destinationKey ?? "") : "",
      id: isTraverse ? (params.destinationId ?? "") : "",
      index: isTraverse ? (params.destinationIndex ?? -1) : -1,
      sameDocument: params.sameDocument,
      getState: () => structuredClone(params.destinationState),
    };

    const event = new MockNavigateEvent({
      navigationType: params.navigationType,
      destination,
      canIntercept: params.canIntercept,
      userInitiated: params.userInitiated,
      info: params.info,
      hashChange: params.hashChange,
      abortController,
      downloadRequest: params.downloadRequest ?? null,
      formData: params.formData ?? null,
      // A traversal without a user activation cannot be cancelled.
      cancelable: !isTraverse,
      precommitSupported: this._precommitSupported,
    });

    event._onScroll = () => {
      this._scrolls.push(this.currentUrl);
    };

    this._dispatch(event);

    // A precommit handler can redirect the navigation before it commits.
    let committedUrl = params.destinationUrl;

    const applyNavigation = (): MockNavigationEntry => {
      if (params.navigationType === "traverse") {
        const idx = this._entries.findIndex(
          (entry) => entry.key === params.destinationKey,
        );

        if (idx !== -1) {
          this._currentIndex = idx;
        }

        return this._entries[this._currentIndex];
      }

      // A reload keeps the entry it reloads.
      if (params.navigationType === "reload") {
        return this._entries[this._currentIndex];
      }

      if (params.navigationType === "replace") {
        const currentKey = this.currentEntry?.key ?? generateKey();
        const newEntry = new MockNavigationEntry(committedUrl, {
          key: currentKey,
          state: params.destinationState,
          index: this._currentIndex,
        });

        this._entries[this._currentIndex] = newEntry;

        return newEntry;
      }

      this._entries = this._entries.slice(0, this._currentIndex + 1);
      const newEntry = new MockNavigationEntry(committedUrl, {
        state: params.destinationState,
        index: this._entries.length,
      });

      this._entries.push(newEntry);
      this._currentIndex = this._entries.length - 1;

      return newEntry;
    };

    if (event._wasIntercepted) {
      const committedPromise = event._hasPrecommitHandlers
        ? this._commitAfterPrecommit(event, applyNavigation, (url) => {
            committedUrl = url;
          })
        : new Promise<MockNavigationEntry>((resolve, reject) => {
            try {
              resolve(applyNavigation());
            } catch (error) {
              // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- re-throwing caught error
              reject(error);
            }
          });

      const finishedPromise = committedPromise.then(async (entry) => {
        try {
          await event._runHandlers();

          // A newer navigation that aborted this one owns the slot.
          if (this._ongoingAbortController === abortController) {
            this._ongoingAbortController = null;
          }

          event._finish();

          return entry;
        } catch (error) {
          // The commit stands: a rejected handler does not move the URL or
          // the entry back (measured on Chromium 153, #2740).
          event._abort();

          throw error;
        }
      });

      // Marked as handled, as the browser does: a refused navigation nobody
      // awaits fires `navigateerror` and no `unhandledrejection` (measured on
      // Chromium 153). An awaiting caller still sees the rejection.
      committedPromise.catch(() => undefined);
      finishedPromise.catch(() => undefined);

      return { committed: committedPromise, finished: finishedPromise };
    }

    // Under async dispatch no listener has run yet, so the navigation is
    // applied in this document whatever a listener later decides.
    const left = this._asyncDispatch
      ? undefined
      : this._leaveDocument(params, applyNavigation, abortController.signal);

    if (left) {
      return left;
    }

    const entry = applyNavigation();

    this._ongoingAbortController = null;

    return {
      committed: Promise.resolve(entry),
      finished: Promise.resolve(entry),
    };
  }

  /**
   * A navigation with precommit handlers commits once they settle, at the URL
   * one of them redirected it to: a microtask after the call that started it
   * at the earliest, `history.pushState()` included. A handler that rejects
   * cancels the navigation, and so does a newer navigation that starts before
   * the commit (measured on Chromium 153, Firefox 155 and WebKit 26.6, #2751).
   */
  private async _commitAfterPrecommit(
    event: MockNavigateEvent,
    applyNavigation: () => MockNavigationEntry,
    redirect: (url: string) => void,
  ): Promise<MockNavigationEntry> {
    try {
      await event._runPrecommitHandlers(
        new MockNavigationPrecommitController(event, this.currentUrl, redirect),
      );
    } catch (error) {
      event._abort();

      throw error;
    }

    if (event.signal.aborted) {
      throw new DOMException("The navigation was aborted", "AbortError");
    }

    return applyNavigation();
  }

  private _dispatch(event: MockNavigateEvent): void {
    const listeners = this._listeners.get("navigate");

    if (!listeners) {
      return;
    }

    if (this._asyncDispatch) {
      // Mirror Safari 26.2 WKWebView behaviour observed in #580: navigate
      // events fire on a subsequent microtask, not synchronously inside
      // `nav.navigate(...)`. Tests that opt into this mode prove the
      // plugin's detection path does not depend on synchronous dispatch.
      // Snapshot listeners to avoid races if the set mutates between now
      // and the microtask running.
      const snapshot = [...listeners];

      queueMicrotask(() => {
        for (const fn of snapshot) {
          fn(event);
        }
      });

      return;
    }

    for (const fn of listeners) {
      fn(event);
    }
  }

  /**
   * What the browser does with a navigation no listener intercepted, when that
   * takes it out of this document's hands: a download, which keeps the
   * document, or a load of a new one. `undefined` for a same-document
   * navigation, which the caller applies in place.
   */
  private _leaveDocument(
    params: NavigationParams,
    applyNavigation: () => MockNavigationEntry,
    signal: AbortSignal,
  ): NavigationResult | undefined {
    if (params.downloadRequest !== undefined) {
      this._ongoingAbortController = null;

      // A navigation started during the download's own event cancels the
      // download (measured on Chromium 153).
      if (!signal.aborted) {
        this._downloads.push(params.destinationUrl);
      }

      return { committed: PENDING, finished: PENDING };
    }

    if (params.sameDocument) {
      return undefined;
    }

    // The session history keeps the entry, so it is applied; the old
    // document, with every promise it holds, is gone, so these never settle.
    this._ongoingAbortController = null;
    this._crossDocumentNavigations.push(params.destinationUrl);

    if (params.canIntercept && this._strictIntercept) {
      throw new DOMException(
        "Navigate event was not intercepted — Chromium would perform a cross-document navigation",
        "InvalidStateError",
      );
    }

    applyNavigation();

    return { committed: PENDING, finished: PENDING };
  }

  private _strictIntercept = false;
  private _precommitSupported = true;
  private readonly _scrolls: string[] = [];
  private readonly _crossDocumentNavigations: string[] = [];
  private readonly _downloads: string[] = [];
  private _asyncDispatch = false;

  /**
   * Make a cross-document navigation that no listener intercepted although it
   * could (`canIntercept: true`) throw `InvalidStateError` from the call site,
   * so a test sees the #518 failure where it happens.
   */
  enableStrictIntercept(): void {
    this._strictIntercept = true;
  }

  /**
   * Opt in to asynchronous navigate-event dispatch — the listener fires on
   * the next microtask after `nav.navigate(...)` returns, mirroring Safari
   * 26.2 WKWebView behaviour observed in #580. Used to verify the plugin's
   * detection of plugin-originated events is identity-based on `event.info`
   * and does NOT depend on synchronous-fire timing (the previous
   * `SyncingFlag` mechanism implicitly required sync dispatch and broke
   * under WKWebView). Not compatible with `enableStrictIntercept()`: the
   * sync intercept check would run before the async listener fires.
   */
  enableAsyncDispatch(): void {
    this._asyncDispatch = true;
  }

  /**
   * A browser without precommit handlers — released Safari, Chromium before
   * 141 (MDN): `intercept()` ignores `precommitHandler`.
   */
  disablePrecommit(): void {
    this._precommitSupported = false;
  }

  /** URLs this document was left for: cross-document navigations no listener intercepted. */
  get crossDocumentNavigations(): readonly string[] {
    return this._crossDocumentNavigations;
  }

  /** URLs of `download()` clicks no listener intercepted. */
  get downloads(): readonly string[] {
    return this._downloads;
  }

  /**
   * The document's URL each time the browser applied a navigation's scroll:
   * when its handlers finished, or on `event.scroll()` (#2751).
   */
  get scrolls(): readonly string[] {
    return this._scrolls;
  }
}
