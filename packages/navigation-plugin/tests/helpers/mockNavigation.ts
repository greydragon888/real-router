/* eslint-disable @typescript-eslint/member-ordering -- mock implementation; ordering doesn't matter */
/* eslint-disable @typescript-eslint/no-empty-function -- interface stubs */

let entryCounter = 0;

function generateKey(): string {
  return `key-${++entryCounter}`;
}

function generateId(): string {
  return `id-${entryCounter}`;
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
    this._state = options.state;
  }

  get index(): number {
    return this._index;
  }

  getState(): unknown {
    return structuredClone(this._state);
  }

  _setState(state: unknown): void {
    this._state = state;
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
  readonly downloadRequest: string | null = null;
  readonly formData: FormData | null = null;
  readonly hasUAVisualTransition: boolean = false;
  readonly sourceElement: Element | null = null;

  private _interceptHandlers: NavigationInterceptHandler[] = [];
  private _abortController: AbortController;

  constructor(options: {
    navigationType: NavigationType;
    destination: NavigationDestination;
    canIntercept: boolean;
    userInitiated: boolean;
    info: unknown;
    hashChange: boolean;
    abortController: AbortController;
  }) {
    super("navigate", { cancelable: true, bubbles: false });
    this.navigationType = options.navigationType;
    this.destination = options.destination;
    this.canIntercept = options.canIntercept;
    this.userInitiated = options.userInitiated;
    this.info = options.info;
    this.hashChange = options.hashChange;
    this._abortController = options.abortController;
    this.signal = options.abortController.signal;
  }

  intercept(options?: NavigationInterceptOptions): void {
    if (options?.handler) {
      this._interceptHandlers.push(options.handler);
    }
  }

  scroll(): void {}

  async _runHandlers(): Promise<void> {
    for (const handler of this._interceptHandlers) {
      await handler();
    }
  }

  get _wasIntercepted(): boolean {
    return this._interceptHandlers.length > 0;
  }

  _abort(): void {
    this._abortController.abort();
  }
}

interface NavigationResult {
  committed: Promise<MockNavigationEntry>;
  finished: Promise<MockNavigationEntry>;
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
    });
  }

  traverseTo(key: string): NavigationResult {
    const targetIndex = this._entries.findIndex((entry) => entry.key === key);

    if (targetIndex === -1) {
      throw new DOMException(
        `Entry with key "${key}" not found in entries list`,
        "InvalidStateError",
      );
    }

    return this._performTraversal(targetIndex, false);
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
      listeners.add(handler as (evt: NavigateEvent) => void);
    }
  }

  removeEventListener(
    type: string,
    fn: ((evt: NavigateEvent) => void) | EventListenerOrEventListenerObject,
  ): void {
    const handler = typeof fn === "function" ? fn : fn.handleEvent.bind(fn);

    this._listeners.get(type)?.delete(handler as (evt: NavigateEvent) => void);
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
  }

  private _performTraversal(
    targetIndex: number,
    userInitiated: boolean,
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
      info: undefined,
      hashChange: isHashChange(this.currentUrl, target.url),
    });
  }

  private _performNavigation(params: {
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
  }): NavigationResult {
    if (this._ongoingAbortController) {
      this._ongoingAbortController.abort();
      this._ongoingAbortController = null;
    }

    const abortController = new AbortController();

    this._ongoingAbortController = abortController;

    const prevIndex = this._currentIndex;
    const prevEntries = [...this._entries];

    const isTraverse = params.navigationType === "traverse";
    const destination: NavigationDestination = {
      url: params.destinationUrl,
      key: isTraverse ? (params.destinationKey ?? "") : "",
      id: isTraverse ? (params.destinationId ?? "") : "",
      index: isTraverse ? (params.destinationIndex ?? -1) : -1,
      sameDocument: true,
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
    });

    const listeners = this._listeners.get("navigate");

    if (listeners) {
      for (const fn of listeners) {
        fn(event);
      }
    }

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

      if (params.navigationType === "replace") {
        const currentKey = this.currentEntry?.key ?? generateKey();
        const newEntry = new MockNavigationEntry(params.destinationUrl, {
          key: currentKey,
          state: params.destinationState,
          index: this._currentIndex,
        });

        this._entries[this._currentIndex] = newEntry;

        return newEntry;
      }

      this._entries = this._entries.slice(0, this._currentIndex + 1);
      const newEntry = new MockNavigationEntry(params.destinationUrl, {
        state: params.destinationState,
        index: this._entries.length,
      });

      this._entries.push(newEntry);
      this._currentIndex = this._entries.length - 1;

      return newEntry;
    };

    const rollback = (): void => {
      this._entries = prevEntries;
      this._currentIndex = prevIndex;
    };

    if (event._wasIntercepted) {
      const committedPromise = new Promise<MockNavigationEntry>(
        (resolve, reject) => {
          try {
            resolve(applyNavigation());
          } catch (error) {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- re-throwing caught error
            reject(error);
          }
        },
      );

      const finishedPromise = committedPromise.then(async (entry) => {
        try {
          await event._runHandlers();
          this._ongoingAbortController = null;

          return entry;
        } catch (error) {
          event._abort();
          rollback();

          throw error;
        }
      });

      return { committed: committedPromise, finished: finishedPromise };
    }

    const entry = applyNavigation();

    this._ongoingAbortController = null;

    return {
      committed: Promise.resolve(entry),
      finished: Promise.resolve(entry),
    };
  }
}
